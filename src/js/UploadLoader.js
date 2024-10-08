import { log, onHandleError } from "./errorHandler";
import StatusCodes from "./codes";
import { Validator } from "./validators";
import {
  createFileEncoderStream,
  CAREncoderStream,
  createDirectoryEncoderStream,
} from "ipfs-car";

class UploadLoader {
  constructor(Http) {
    this.Http = Http;
  }
  async uploadBlobToAddresses(options, blob, uploadAddresses, onProgress) {
    const progressMap = new Map();
    const abortControllers = [];
    let resolved = false;

    const uploadResults = []; // 用于记录每个地址的上传结果

    // const options = {
    //   asset_name: folderName,
    //   asset_type: "folder",
    //   asset_size: blob.size,
    //   area_id: areaId,
    //   group_id: groupId,
    //   asset_cid: rootCID.toString(),
    //   extra_id: "",
    // };

    const abortOtherUploads = () =>
      abortControllers.forEach((controller) => controller.abort());

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
          const maxProgress = Math.max(...progressMap.values());
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
          log(
            `Upload failed for address ${address.CandidateAddr}: ${error.message}`
          );
          uploadResults.push({
            status: 2,
            msg: error.message,
            elapsedTime: 0,
            transferRate: 0,
            size: options.asset_size ?? 0,
            traceId: address.TraceID,
            nodeId: nodeId,
            cId: null,
            log: { [nodeId]: error.message },
          });

          return Promise.reject(error);
        });
    });

    try {
      const assetResponse = await Promise.any(uploadPromises);
      return assetResponse;
    } catch {
      return {
        code: StatusCodes.UPLOAD_FILE_ERROR,
        mes: "All upload addresses failed.",
      };
    }
  }

  async getUploadAddresses() {
    try {
      const response = await this.Http.getData(
        "/api/v1/storage/get_upload_info?t=" + new Date().getTime()
      );
      if (response.code !== 0) {
        return onHandleError(
          response.code,
          "Failed to get upload addresses: " + response
        );
      }
      return response.data;
    } catch (error) {
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to get upload addresses: " + error.message
      );
    }
  }
  async createAsset(assetData) {
    try {
      const response = await this.Http.postData(
        "/api/v1/storage/create_asset",
        assetData
      );
      if (response.code !== 0) {
        return onHandleError(response.code, "Failed to create asset.");
      }
      return response;
    } catch (error) {
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to create asset: " + error.message
      );
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
        return onHandleError(
          response.code,
          "Failed to upload file: " + response
        );
      }
      return response;
    } catch (error) {
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to upload file: " + error.message
      );
    }
  }

  async onFileUpload(
    file,
    assetData = { areaId: [], groupId: 0, assetType: 0, extraId: "" },
    onProgress
  ) {
    try {
      const { areaId = [], groupId = 0, assetType = 0 } = assetData;

      // 验证 areaId、groupId 和 assetType
      const validateAreaId = Validator.validateAreaId(areaId);
      if (validateAreaId) return validateAreaId;

      const validateGroupId = Validator.validateGroupId(groupId);
      if (validateGroupId) return validateGroupId;

      const validateAssetType = Validator.validateAssetType(assetType);
      if (validateAssetType) return validateAssetType;

      if (assetType === 0) {
        // 文件上传流程
        return await this.handleFileUpload(
          file,
          areaId,
          groupId,
          assetType,

          onProgress
        );
      } else {
        // 文件夹上传流程
        return await this.handleFolderUpload(
          file,
          areaId,
          groupId,
          extraId,
          onProgress
        );
      }
    } catch (error) {
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "File upload error: " + error.message
      );
    }
  }

  async handleFileUpload(file, areaId, groupId, extraId, onProgress) {
    var obj = await this.getUploadAddresses();

    const uploadAddresses = obj.List;
    const TraceID = obj.TraceID;

    const progressMap = new Map();
    const abortControllers = [];
    let resolved = false;
    const uploadResults = []; // 用于记录每个地址的上传结果

    const abortOtherUploads = () =>
      abortControllers.forEach((controller) => controller.abort());

    const uploadPromises = uploadAddresses.map((address, index) => {
      const controller = new AbortController();
      abortControllers.push(controller);
      const startTime = Date.now(); // 记录上传开始时间
      const nodeId = address.NodeID.replace(/^c_/, "");
      return this.uploadFile(
        address.UploadURL,
        address.Token,
        file,
        controller.signal,
        (loaded, total, percentComplete) => {
          progressMap.set(index, percentComplete);
          const maxProgress = Math.max(...progressMap.values());
          if (onProgress) onProgress(loaded, total, maxProgress);
        }
      )
        .then((uploadResult) => {
          const endTime = Date.now(); // 记录上传结束时间
          const elapsedTime = endTime - startTime; // 计算上传耗时（毫秒）
          const transferRate = Math.floor((file.size / elapsedTime) * 1000); // 向下取整,// 计算传输速率（字节每秒）
          // 记录上传状态和性能数据
          uploadResults.push({
            status: uploadResult.code == 0 ? 1 : 2,
            msg: uploadResult.msg, ////Failed to upload file: Upload aborted
            elapsedTime: elapsedTime,
            transferRate: transferRate,
            size: file.size,
            traceId: TraceID,
            nodeId: nodeId,
            cId: uploadResult.cid,
            log: uploadResult.code == 0 ? "" : { [nodeId]: uploadResult.msg },
          });
          if (!resolved) {
            resolved = true;
            abortOtherUploads();
            return this.createAsset({
              asset_name: file.name,
              asset_type: "file",
              asset_size: file.size,
              area_id: areaId,
              group_id: groupId,
              asset_cid: uploadResult.cid,
              node_id: address.NodeID,
              extra_id: extraId,
            });
          }
        })
        .catch((error) => {
          log(
            `Upload failed for address ${address.UploadURL}: ${error.message}`
          );
          uploadResults.push({
            status: 2,
            msg: error.message,
            elapsedTime: 0,
            transferRate: 0,
            size: file.size,
            traceId: TraceID,
            nodeId: nodeId,
            cId: null,
            log: { [nodeId]: error.message },
          });
          return Promise.reject(error);
        });
    });

    try {
      const assetResponse = await Promise.any(uploadPromises);
      this.creatReportData(uploadResults);
      return assetResponse;
    } catch {
      return {
        code: StatusCodes.UPLOAD_FILE_ERROR,
        mes: "All upload addresses failed.",
      };
    }
  }

  async handleFolderUpload(file, areaId, groupId, assetType, onProgress) {
    let myFile = null;
    let rootCID = null;

    await createDirectoryEncoderStream(file)
      .pipeThrough(
        new TransformStream({
          transform: (block, controller) => {
            rootCID = block.cid;
            controller.enqueue(block);
            // console.log("root:", rootCID.toString());
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
          },
          close: async () => {
            const blob = new Blob([myFile]);
            const folderName = file[0].webkitRelativePath.split("/")[0];
            const options = {
              asset_name: folderName,
              asset_type: "folder",
              asset_size: blob.size,
              area_id: areaId,
              group_id: groupId,
              asset_cid: rootCID.toString(),
              extra_id: "",
            };
            console.log("options=", options);
            const res = await this.createAsset(options);
            if (res.code == 0) {
              return await this.uploadBlobToAddresses(
                options,
                blob,
                res.data,
                onProgress
              );
            } else {
              return res;
            }
          },
          abort(error) {
            return {
              code: StatusCodes.UPLOAD_FILE_ERROR,
              mes: "File upload failed:" + error.message,
            };
          },
        })
      );
  }
  ///数据上报：
  async postReport(
    traceId, // 追踪 ID
    cid, // 资产 ID
    nodeId, // 节点 ID，格式为 "node1, node2, node3"
    rate, // 传输速率（bytes/s）
    costMs, // 消耗时间（毫秒）
    totalSize, // 总大小（bytes）
    state, // 状态（0: created, 1: success, 2: failed）
    transferType, // 传输类型（upload / download）
    log // 日志信息，JSON 字符串 "{\"node1\": \"网络延迟\", \"node2\": \"无\"}"
  ) {
    try {
      // 构建报告数据对象
      const map = {
        trace_id: traceId,
        cid: cid,
        node_id: nodeId,
        rate: rate,
        cost_ms: costMs,
        total_size: totalSize,
        state: state,
        transfer_type: transferType,
        log: log,
      };

      console.log("xxx====map=======" + JSON.stringify(map));

      // 发送 POST 请求
      const response = await this.Http.postData(
        "/api/v1/storage/transfer/report",
        map
      );
      // 检查响应代码是否为 0
      if (response.code !== 0) {
        return onHandleError(response.code, "Failed to report.");
      }
      return response;
    } catch (error) {
      return onHandleError(
        StatusCodes.REPORT_ERROR,
        "Failed to report: " + error.message
      );
    }
  }
  ///数据上报数据创建
  creatReportData(uploadResults) {
    ///数据上报：
    const failedUploads = uploadResults.filter(
      (result) => result.msg != "Failed to upload file: Upload aborted"
    );

    // 提取 nodeId，将其转为小写，并格式化为 "node1, node2, node3"
    const nodeIdsString = failedUploads
      .map((result) => result.nodeId.toLowerCase()) // 转为小写
      .join(", ");

    // 合并所有 log 对象
    const combinedLog = failedUploads.reduce((acc, result) => {
      return { ...acc, ...result.log };
    }, {});

    // 检查是否为空对象，返回 null 或 JSON 字符串
    const combinedLogJson =
      Object.keys(combinedLog).length === 0
        ? null
        : JSON.stringify(combinedLog);

    const traceId = failedUploads[0].traceId;
    const cid = failedUploads[0].cId;
    const nodeId = nodeIdsString;
    const rate = failedUploads[0].transferRate;
    const costMs = failedUploads[0].elapsedTime;
    const totalSize = failedUploads[0].size;
    const state = failedUploads[0].status;
    const transferType = "upload";
    const log = combinedLogJson;
    this.postReport(
      traceId,
      cid,
      nodeId,
      rate,
      costMs,
      totalSize,
      state,
      transferType,
      log
    );
  }
}

export default UploadLoader;
