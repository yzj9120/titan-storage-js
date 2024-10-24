import { log, onHandleData } from "./errorHandler";
import StatusCodes from "./codes";
import { Validator } from "./validators";
import Report from "./report";

import {
  createFileEncoderStream,
  CAREncoderStream,
  createDirectoryEncoderStream,
} from "ipfs-car";

class UploadLoader {
  constructor(Http) {
    this.Http = Http;
    this.report = new Report(this.Http);
  }
  //// 登陆上传（文件）：获取上传地址
  async getUploadAddresses() {
    try {
      const response = await this.Http.getData(
        "/api/v1/storage/get_upload_info?t=" +
          new Date().getTime() +
          "&need_trace=true"
      );

      return response.data;
    } catch (error) {
      return onHandleData({ code: StatusCodes.FAILURE, msg: error });
    }
  }
  //// 外部上传：获取上传地址
  async getTempFileUploadAddresses() {
    try {
      const response = await this.Http.getData(
        "/api/v1/storage/temp_file/get_upload_file?t=" +
          new Date().getTime() +
          "&need_trace=true"
      );

      return response.data;
    } catch (error) {
      return onHandleData({ code: StatusCodes.FAILURE, msg: error });
    }
  }

  //// 登陆上传（文件夹）：获取上传地址

  async createAsset(assetData) {
    try {
      const response = await this.Http.postData(
        "/api/v1/storage/create_asset",
        assetData
      );

      return response;
    } catch (error) {
      return onHandleData({ code: StatusCodes.FAILURE, msg: error });
    }
  }
  //// 外部上传（文件夹）：获取上传地址
  async tempFileUpload(assetData) {
    try {
      const response = await this.Http.postData(
        "/api/v1/storage/temp_file/upload",
        assetData
      );

      return response;
    } catch (error) {
      log(333, error);
      return onHandleData({ code: StatusCodes.FAILURE, msg: error });
    }
  }

  async uploadBlobToAddresses(options, blob, uploadAddresses, onProgress) {
    const progressMap = new Map();
    const abortControllers = [];
    let resolved = false;
    const uploadResults = []; // 用于记录每个地址的上传结果
    const abortOtherUploads = () =>
      abortControllers.forEach((controller) => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      });

    const uploadPromises = uploadAddresses.map((address, index) => {
      const controller = new AbortController();
      abortControllers.push(controller);
      const startTime = Date.now(); // 记录上传开始时间
      //拆分获取nodeId
      const parsedUrl = new URL(address.CandidateAddr);
      // 提取地址的第一部分
      const nodeId = parsedUrl.hostname.split(".")[0];
      return this.uploadFile(
        address.CandidateAddr,
        address.Token,
        blob,
        controller.signal,
        (loaded, total, percentComplete) => {
          progressMap.set(index, percentComplete);
          const maxProgress =
            progressMap.size > 0 ? Math.max(...progressMap.values()) : 0;
          if (onProgress) onProgress(loaded, total, maxProgress);
        }
      )
        .then((uploadResult) => {
          const endTime = Date.now(); // 记录上传结束时间
          const elapsedTime = endTime - startTime; // 计算上传耗时（毫秒）
          const transferRate = Math.floor(
            ((options.asset_size ?? 0) / elapsedTime) * 1000
          ); // 向下取整,// 计算传输速率（字节每秒）
          // 记录上传状态和性能数据
          uploadResults.push({
            status: uploadResult.code == 0 ? 1 : 2,
            msg: uploadResult.msg, ////Failed to upload file: Upload aborted
            elapsedTime: elapsedTime,
            transferRate: transferRate,
            size: options.asset_size ?? 0,
            traceId: address.TraceID,
            nodeId: nodeId,
            cId: options.asset_cid,
            log: uploadResult.code == 0 ? "" : { [nodeId]: uploadResult.msg },
          });
          if (!resolved) {
            resolved = true;
            abortOtherUploads();
            return uploadResult;
          }
        })
        .catch((error) => {
          uploadResults.push({
            status: 2,
            msg: error,
            elapsedTime: 0,
            transferRate: 0,
            size: options.asset_size ?? 0,
            traceId: address.TraceID,
            nodeId: nodeId,
            cId: null,
            log: { [nodeId]: error },
          });
          return Promise.reject(error);
        });
    });

    try {
      const assetResponse = await Promise.any(uploadPromises);
      this.report.creatReportData(uploadResults, "upload");
      assetResponse.cId = options.asset_cid ?? "";
      return assetResponse;
    } catch {
      this.report.creatReportData(uploadResults, "upload");
      return {
        code: StatusCodes.UPLOAD_FILE_ERROR,
        msg: "All upload addresses failed.",
      };
    }
  }

  async uploadFile(uploadUrl, token, file, signal, onProgress) {
    try {
      const response = await this.Http.uploadFile(
        uploadUrl,
        token,
        file,
        null,
        onProgress,
        signal
      );
      if (response.code !== 0) {
        return onHandleData({
          code: response.code,
          msg: "Failed to upload file: " + response.msg,
        });
      }
      return response;
    } catch (error) {
      return onHandleData({
        code: StatusCodes.FAILURE,
        msg: "Failed to upload file: " + error,
      });
    }
  }

  /// 文件中（文件+ 文件夹）上传
  async onFileUpload(
    file,
    options = {
      areaId: [],
      groupId: 0,
      assetType: 0,
      extraId: "",
      retryCount: 2,
    },
    onProgress,
    onStreamStatus
  ) {
    try {
      const {
        areaId = [],
        groupId = 0,
        assetType = 0,
        extraId = "",
        retryCount = 2,
      } = options;

      //  const areaId= options.areaId??[]
      //  const groupId= options.groupId??0
      //  const assetType= options.assetType??0
      //  const extraId= options.extraId??""
      //  const retryCount= options.retryCount??2

      // 验证 areaId、groupId 和 assetType
      const validateAreaId = Validator.validateAreaId(areaId);
      if (validateAreaId) return validateAreaId;

      const validateGroupId = Validator.validateGroupId(groupId);
      if (validateGroupId) return validateGroupId;

      const validateAssetType = Validator.validateAssetType(assetType);
      if (validateAssetType) return validateAssetType;

      if (groupId == -1) {
        const validateAssetFile = Validator.validateAssetFile(file.size);
        if (validateAssetFile) return validateAssetFile;
      }

      if (assetType === 0) {
        // 文件上传流程
        return await this.handleFileUpload(
          file,
          areaId,
          groupId,
          extraId,
          retryCount,
          onProgress
        );
      } else {
        // 文件夹上传流程
        return await this.handleFolderUpload(
          file,
          areaId,
          groupId,
          extraId,
          retryCount,
          onProgress,
          onStreamStatus
        );
      }
    } catch (error) {
      return onHandleData({
        code: StatusCodes.FAILURE,
        msg: "Failed to upload file: " + JSON.stringify(error),
      });
    }
  }
  // 文件上传流程
  async handleFileUpload(
    file,
    areaId,
    groupId,
    extraId,
    retryCount = 2,
    onProgress
  ) {
    var obj;
    if (groupId == -1) {
      ///外部上传
      obj = await this.getTempFileUploadAddresses();
    } else {
      /// 登陆后上传
      obj = await this.getUploadAddresses();
    }

    const uploadAddresses = obj.List;
    const TraceID = obj.TraceID ?? "";

    const progressMap = new Map();
    const abortControllers = [];
    let resolved = false;
    const uploadResults = []; // 用于记录每个地址的上传结果

    const abortOtherUploads = () =>
      abortControllers.forEach((controller) => controller.abort());
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // 定义带重试逻辑的上传函数
    const attemptUpload = async (address, index, attemptsLeft) => {
      const controller = new AbortController();
      abortControllers.push(controller);
      const startTime = Date.now();
      const nodeId = address.NodeID.replace(/^c_/, "");
      try {
        const uploadResult = await this.uploadFile(
          address.UploadURL,
          address.Token,
          file,
          controller.signal,
          (loaded, total, percentComplete) => {
            progressMap.set(index, percentComplete);
            const maxProgress =
              progressMap.size > 0 ? Math.max(...progressMap.values()) : 0;
            if (onProgress) onProgress(loaded, total, maxProgress);
          }
        );
        const endTime = Date.now();
        const elapsedTime = endTime - startTime;
        const transferRate = Math.floor((file.size / elapsedTime) * 1000); // 计算传输速率
        // 记录上传结果
        uploadResults.push({
          status: uploadResult.code == 0 ? 1 : 2,
          msg: uploadResult.msg,
          elapsedTime,
          transferRate,
          size: file.size,
          traceId: TraceID,
          nodeId,
          cId: uploadResult.cid,
          log: uploadResult.code == 0 ? "" : { [nodeId]: uploadResult.msg },
        });
        // 上传成功后停止其他上传
        if (uploadResult.code === 0) {
          if (!resolved) {
            resolved = true;
            abortOtherUploads();
            if (groupId != -1) {
              const res = await this.createAsset({
                asset_name: file.name,
                asset_type: "file",
                asset_size: file.size,
                area_id: areaId,
                group_id: groupId,
                asset_cid: uploadResult.cid,
                node_id: address.NodeID,
                extra_id: extraId,
              });
              log(11111, res);
              if (res.err == 1017) {
                return onHandleData({
                  code: 0,
                  data: {
                    cid: uploadResult.cid,
                    isAlreadyExist: true,
                    url: res.data.assetDirectUrl,
                  },
                });
              }
              return onHandleData({
                code: 0,
                msg: "Upload success",
                data: { cid: uploadResult.cid },
              });
            } else {
              ///外部上传 没有登录的情况
              await this.tempFileUpload({
                asset_name: file.name,
                asset_type: "file",
                asset_size: file.size,
                area_id: areaId,
                group_id: groupId,
                asset_cid: uploadResult.cid,
                node_id: address.NodeID,
                extra_id: extraId,
              });
              return onHandleData({
                code: 0,
                msg: "Upload success",
                data: { cid: uploadResult.cid },
              });
            }
          }
        } else {
          return onHandleData({
            code: uploadResult.code,
            msg: uploadResult.msg,
            data: { cid: uploadResult.cid },
          });
        }
      } catch (error) {
        // 处理失败和重试逻辑
        if (attemptsLeft > 0) {
          const backoff = (retryCount - attemptsLeft + 1) * 1000; // 延迟时间，逐步增加
          await delay(backoff);
          return attemptUpload(address, index, attemptsLeft - 1); // 重试
        }

        // 达到最大重试次数后，记录失败结果
        uploadResults.push({
          status: 2,
          msg: error.message || "Unknown error",
          elapsedTime: 0,
          transferRate: 0,
          size: file.size,
          traceId: TraceID,
          nodeId,
          cId: null,
          log: { [nodeId]: error.message },
        });

        return Promise.reject(error); // 重试失败后抛出错误
      }
    };

    // 为每个上传地址创建上传任务，并带有重试逻辑
    const uploadPromises = uploadAddresses.map((address, index) =>
      attemptUpload(address, index, retryCount)
    );

    try {
      // 任何一个上传成功时都会返回成功结果
      const assetResponse = await Promise.any(uploadPromises);
      this.report.creatReportData(uploadResults, "upload");
      return assetResponse;
    } catch {
      // 所有上传失败时返回失败结果
      this.report.creatReportData(uploadResults, "upload");
      return onHandleData({
        code: StatusCodes.UPLOAD_FILE_ERROR,
        msg: "All upload addresses failed.",
      });
    }
  }
  // 文件夹上传流程
  async handleFolderUpload(
    file,
    areaId,
    groupId,
    extraId,
    retryCount = 2,
    onProgress,
    onWritableStream
  ) {
    let myFile;
    let rootCID;
    let blob; // 在外部定义 blob

    const resultPromise = new Promise((resolve, reject) => {
      createDirectoryEncoderStream(file)
        .pipeThrough(
          new TransformStream({
            transform: (block, controller) => {
              rootCID = block.cid;
              controller.enqueue(block);
            },
          })
        )
        .pipeThrough(new CAREncoderStream())
        .pipeTo(
          new WritableStream({
            write(chunk) {
              if (!myFile) {
                myFile = chunk;
              } else {
                let mergedArray = new Uint8Array(myFile.length + chunk.length);
                mergedArray.set(myFile);
                mergedArray.set(chunk, myFile.length);
                myFile = mergedArray;
              }
              if (onWritableStream) onWritableStream("writing");
            },
            close: async () => {
              try {
                if (onWritableStream) onWritableStream("close");
                blob = new Blob([myFile]); // 只生成一次 Blob
                const folderName = file[0].webkitRelativePath.split("/")[0];
                const options = {
                  asset_name: folderName,
                  asset_type: "folder",
                  asset_size: blob.size,
                  area_id: areaId,
                  group_id: groupId,
                  asset_cid: rootCID.toString(),
                  extra_id: extraId,
                  need_trace: true,
                };

                if (groupId != -1) {
                  const assetResponse = await this.createAsset(options);
                  if (assetResponse.code === 0) {
                    await this.uploadToAddresses(
                      blob,
                      options,
                      assetResponse.data,
                      onProgress,
                      retryCount,
                      resolve,
                      reject,
                      onWritableStream
                    );
                  } else if (assetResponse.err == 1017) {
                    resolve(
                      onHandleData({
                        code: 0,
                        msg: "Upload success",
                        data: {
                          cid: rootCID.toString(),
                          isAlreadyExist: true,
                          url: res.data.assetDirectUrl,
                        },
                      })
                    );
                  } else {
                    resolve(
                      onHandleData({
                        code: assetResponse.code,
                        msg: assetResponse.msg ?? "",
                      })
                    );
                  }
                } else {
                  const assetResponse = await this.tempFileUpload(options);

                  if (assetResponse.code === 0) {
                    await this.uploadToAddresses(
                      blob,
                      options,
                      assetResponse.data,
                      onProgress,
                      retryCount,
                      resolve,
                      reject,
                      onWritableStream
                    );
                  } else {
                    resolve(
                      onHandleData({
                        code: assetResponse.code,
                        msg: assetResponse.msg,
                      })
                    );
                  }
                }
              } catch (error) {
                reject(onHandleData({ code: -1, msg: error }));
              }
            },
            abort(error) {
              if (onWritableStream) onWritableStream("abort");
              reject(
                onHandleData({
                  code: StatusCodes.UPLOAD_FILE_ERROR,
                  msg: error,
                })
              );
            },
          })
        )
        .catch((error) => {
          reject(
            onHandleData({ code: StatusCodes.UPLOAD_FILE_ERROR, msg: error })
          );
        });
    });

    return await resultPromise;
  }

  async uploadToAddresses(
    blob,
    options,
    addresses,
    onProgress,
    retryCount,
    resolve,
    reject,
    onWritableStream
  ) {
    try {
      const uploadResult = await this.uploadBlobToAddresses(
        options,
        blob,
        addresses,
        onProgress
      );
      if (uploadResult.code === 0) {
        resolve(
          onHandleData({
            code: 0,
            msg: uploadResult.msg,
            data: { cid: uploadResult.cid },
          })
        );
      } else {
        if (retryCount > 0) {
          await this.uploadToAddresses(
            blob,
            options,
            addresses,
            onProgress,
            retryCount - 1,
            resolve,
            reject,
            onWritableStream
          );
        } else {
          reject(
            onHandleData({
              code: -1,
              msg: "File upload failed after multiple attempts",
            })
          );
        }
      }
    } catch (error) {
      reject(onHandleData({ code: -1, msg: error }));
    }
  }
}

export default UploadLoader;
