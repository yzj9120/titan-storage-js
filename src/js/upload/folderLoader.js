import { log, onHandleData } from "../errorHandler"; // 导入错误处理相关的模块
import StatusCodes from "../codes"; // 导入状态码模块
import Report from "../report"; // 导入报告模块
import {
  createFileEncoderStream,
  CAREncoderStream,
  createDirectoryEncoderStream,
} from "ipfs-car";

class FolderLoader {
  constructor(httpService) {
    this.httpService = httpService; // 接收 Http 实例
    this.report = new Report(this.httpService); // 创建报告实例，用于记录上传结果
  }
  async uploadFile(uploadUrl, token, file, signal, onProgress) {
    try {
      const response = await this.httpService.uploadFile(
        uploadUrl,
        token,
        file,
        signal,
        onProgress
      );
      if (response.code !== 0) {
        return onHandleData({
          code: response.code,
          msg: "Failed to upload file: " + response.msg,
        });
      }
      return response; // 返回上传成功的结果
    } catch (error) {
      return onHandleData({
        code: StatusCodes.FAILURE,
        msg: "Failed to upload file: " + error,
      });
    }
  }

  async handleFolderUpload(file, options, onProgress, onWritableStream) {
    const { areaId = [], groupId = 0, extraId = "", retryCount = 3 } = options;

    const uploadResults = []; // 记录上传结果
    const startTime = Date.now(); // 上传开始时间
    let uploadSuccessful = false; // 上传是否成功的标记

    // 创建并处理文件夹切片
    const streaRes = await this.createDirectoryStream(file, onWritableStream);
    if (streaRes.code !== 0) {
      return streaRes; // 如果创建流失败，直接返回错误
    }

    const folderName = file[0].webkitRelativePath.split("/")[0];
    const assetData = {
      asset_name: folderName,
      asset_type: "folder",
      asset_size: streaRes.data.blob.size,
      group_id: groupId,
      asset_cid: streaRes.data.rootCid,
      extra_id: extraId,
      need_trace: true,
    };

    const isTempUpload = groupId === -1; // 判断是否为临时上传

    var assetData2 = {};
    if (isTempUpload) {
      assetData2 = {
        ...assetData,
        area_ids: areaId,
      };
    } else {
      assetData2 = {
        ...assetData,
        area_id: areaId,
      };
    }
    /// 获取下载地址：
    const res = await this.httpService.postFileUpload({
      isLoggedIn: !isTempUpload,
      areaIds: areaId,
      assetData: assetData2,
    });
    // 封装上传逻辑
    const attemptUpload = async (address, blob, onProgress) => {
      const controller = new AbortController();
      const parsedUrl = new URL(address.CandidateAddr);
      const nodeId = parsedUrl.hostname.split(".")[0];
      const startTime = Date.now(); // 上传开始时间
      const uploadResult = await this.uploadFile(
        address.CandidateAddr,
        address.Token,
        blob,
        controller.signal,
        (loaded, total, percentComplete) => {
          if (onProgress) onProgress(loaded, total, percentComplete);
        }
      );

      const TraceID = address.TraceID ?? ""; // 获取 TraceID
      const endTime = Date.now();
      const elapsedTime = endTime - startTime; // 计算耗时
      const transferRate = Math.floor((file.size / elapsedTime) * 1000); // 计算传输速率

      // 将结果记录到 uploadResults 数组
      uploadResults.push({
        status: uploadResult.code === 0 ? 1 : 2,
        msg: uploadResult.msg,
        elapsedTime: elapsedTime,
        transferRate: transferRate,
        size: blob.size,
        traceId: TraceID,
        nodeId: nodeId,
        cId: uploadResult.cid ?? "",
        log: uploadResult.code === 0 ? "" : { [nodeId]: uploadResult.msg },
        ...uploadResult, // 保留原始上传结果
      });

      // 记录上传结果
      return uploadResult;
    };

    // 处理返回结果 (文件已存在)
    if (res.data.err && res.data.err === 1017) {
      return onHandleData({
        code: 0,
        data: {
          cid: streaRes.data.rootCid,
          isAlreadyExist: true,
          url: res.data.assetDirectUrl,
        },
      });
    }
    // 失败返回
    if (res.code !== 0) return res;

    const uploadAddresses = res.data.List ?? [];

    const uploadResult = await this.uploadWithRetry(
      uploadAddresses,
      attemptUpload,
      retryCount,
      streaRes.data.blob,
      onProgress
    );

    this.report.creatReportData(uploadResults, "upload");
    // 处理上传结果
    if (uploadResult.code === 0) {
      // 返回成功结果，保留 cId
      return {
        ...uploadResult,
        cid: streaRes.data.rootCid,
      };
    } else {
      return {
        code: StatusCodes.UPLOAD_FILE_ERROR, // 上传文件错误状态码
        msg: "All upload addresses failed.", // 错误信息
      };
    }
  }

  // 创建文件夹切片的函数
  async createDirectoryStream(file, onWritableStream) {
    return new Promise((resolve, reject) => {
      let myFile;
      let rootCID;

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
                // 合并数据块
                let mergedArray = new Uint8Array(myFile.length + chunk.length);
                mergedArray.set(myFile);
                mergedArray.set(chunk, myFile.length);
                myFile = mergedArray;
              }
              if (onWritableStream) onWritableStream("writing");
            },
            close: () => {
              if (onWritableStream) onWritableStream("close");
              resolve(
                onHandleData({
                  code: 0,
                  data: {
                    blob: new Blob([myFile]),
                    rootCid: rootCID.toString(),
                  },
                })
              );
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
        .catch((error) =>
          reject(
            onHandleData({ code: StatusCodes.UPLOAD_FILE_ERROR, msg: error })
          )
        );
    });
  }

  async uploadWithRetry(
    addresses,
    attemptUpload,
    retryCount,
    blob,
    onProgress
  ) {
    // 递归函数：逐个处理地址
    const processAddress = async (index) => {
      if (index >= addresses.length) {
        return {
          code: StatusCodes.UPLOAD_FILE_ERROR,
          msg: "All upload addresses failed.",
        };
      }

      for (let attempts = 0; attempts < retryCount; attempts++) {
        log(
          `Processing address ${index + 1}/${addresses.length}, attempt ${
            attempts + 1
          }/${retryCount}`
        );

        try {
          const uploadResult = await attemptUpload(
            addresses[index],
            blob,
            onProgress
          ); // 尝试上传
          if (uploadResult.code === 0) {
            return uploadResult; // 成功上传
          }
        } catch (error) {
          // 等待后重试
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempts))
          );
        }
      }
      // 递归处理下一个地址
      return processAddress(index + 1);
    };

    return processAddress(0);
  }

  // 延迟重试
  delayRetry(attempts) {
    return new Promise((resolve) =>
      setTimeout(resolve, 1000 * Math.pow(2, attempts))
    );
  }

  // 处理上传错误
  handleUploadError() {
    return {
      code: StatusCodes.UPLOAD_FILE_ERROR,
      msg: "All upload addresses failed.",
    };
  }
}

export default FolderLoader;
