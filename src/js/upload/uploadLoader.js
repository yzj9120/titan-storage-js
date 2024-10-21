import { log, onHandleData } from "../errorHandler"; // 导入错误处理相关的模块
import StatusCodes from "../codes"; // 导入状态码模块
import { Validator } from "../validators"; // 导入验证模块
import Report from "../report"; // 导入报告模块

import SparkMD5 from "../spark-md5"
class UploadLoader {
  constructor(httpService) {
    this.httpService = httpService; // 接收 Http 实例
    this.report = new Report(this.httpService); // 创建报告实例，用于记录上传结果
  }

  // 文件上传
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

  // 文件上传入口
  async onFileUpload(file, options, onProgress) {
    const {
      areaId = [],
      groupId = 0,
      assetType = 0,
      extraId = "",
      retryCount = 3,
    } = options;
    const uploadResults = await this.handleFileUpload(
      file,
      areaId,
      groupId,
      extraId,
      retryCount,
      onProgress
    )
    return uploadResults; // 返回最终的上传结果
  }


  // 处理文件上传
  async handleFileUpload(file, areaId, groupId, extraId, retryCount = 3, onProgress) {

    const isTempUpload = groupId === -1; // 判断是否为临时上传 （-1 临时文件）
    const uploadResults = []; // 记录上传结果
    const startTime = Date.now(); // 上传开始时间
    let uploadSuccessful = false; // 上传是否成功的标记
    try {

      const hashRes = await this.calculateFileHash(file);

      if (hashRes.code != 0) return hashRes;

      const md5 = hashRes.data.hash;

      const res = await this.httpService.getFileUploadURL({
        isLoggedIn: !isTempUpload,
        areaIds: areaId,
        isFolder: false,
        assetData: md5,
      });

      console.log(111, res.data.AlreadyExists)
      if (res.code != 0) return res;

      if (res.data.AlreadyExists) {
        const result = await this.onCreateAsset(isTempUpload, file, areaId, groupId, extraId, md5, { cid: res.data.CID, nodeId: "" })
        // 返回成功结果，保留 cId
        return result
      }

      const uploadAddresses = res.data;
      // // 封装上传逻辑的函数
      const attemptUpload = async (address) => {
        const controller = new AbortController(); // 创建 AbortController
        const nodeId = address.NodeID.replace(/^c_/, ""); // 去掉前缀
        const uploadResult = await this.uploadFile(
          address.UploadURL,
          address.Token,
          file,
          controller.signal,
          (loaded, total, percentComplete) => {
            onProgress && onProgress(loaded, total, percentComplete); // 进度回调
          }
        );
        const TraceID = uploadAddresses.TraceID ?? ""; // 获取 TraceID
        const endTime = Date.now();
        const elapsedTime = endTime - startTime; // 计算耗时
        const transferRate = Math.floor((file.size / elapsedTime) * 1000); // 计算传输速率

        // 将结果记录到 uploadResults 数组
        uploadResults.push({
          status: uploadResult.code === 0 ? 1 : 2,
          msg: uploadResult.msg,
          elapsedTime: elapsedTime,
          transferRate: transferRate,
          size: file.size,
          traceId: TraceID,
          nodeId: nodeId,
          cId: uploadResult.cid ?? "",
          log: uploadResult.code === 0 ? "" : { [nodeId]: uploadResult.msg },
          ...uploadResult, // 保留原始上传结果
        });
        uploadResult.nodeId = address.NodeID;
        // 如果上传成功，则标记为成功
        if (uploadResult.code === 0) {
          uploadSuccessful = true;
        }
        return uploadResult; // 返回上传结果
      };

      const uploadResult = await this.uploadWithRetry(uploadAddresses.List, attemptUpload, retryCount, onProgress);
      ///数据上报
      this.report.creatReportData(uploadResults, "upload");
      // 处理上传结果
      if (uploadResult.code === 0) {
        const result = await this.onCreateAsset(isTempUpload, file, areaId, groupId, extraId, md5, uploadResult)
        // 返回成功结果，保留 cId
        return result
      } else {
        return {
          code: StatusCodes.UPLOAD_FILE_ERROR, // 上传文件错误状态码
          msg: "All upload addresses failed.", // 错误信息
        };
      }
    } catch (error) {
      return onHandleData({ code: StatusCodes.FAILURE, msg: error });
    }
  }

  ///重试机制
  async uploadWithRetry(addresses, attemptUpload, retryCount, onProgress) {
    // 递归函数：逐个处理地址
    const processAddress = async (index) => {
      if (index >= addresses.length) {
        return { code: StatusCodes.UPLOAD_FILE_ERROR, msg: "All upload addresses failed." };
      }

      for (let attempts = 0; attempts < retryCount; attempts++) {
        try {
          const uploadResult = await attemptUpload(addresses[index]); // 尝试上传
          if (uploadResult.code === 0) return uploadResult; // 成功上传
        } catch (error) {
          // 等待后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
        }
      }

      // 递归处理下一个地址
      return processAddress(index + 1);
    };

    return processAddress(0);
  }

  /// 获取md5
  async calculateFileHash(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.readAsArrayBuffer(file);

      reader.onload = () => {
        // 计算MD5哈希值
        const hash = SparkMD5.ArrayBuffer.hash(reader.result);
        resolve({
          code: 0,
          data: {
            hash: hash
          }
        }); // 返回计算的hash
      };

      // 处理读取文件错误
      reader.onerror = (error) => {
        reject({
          code: StatusCodes.FAILURE, // 上传文件错误状态码
          msg: error, // 错误信息
        });
      };
    });
  }
  /// 上传完成后的操作
  async onCreateAsset(isTempUpload, file, areaId, groupId, extraId, md5, uploadResult) {
    // 构建基本的 assetData 对象
    const assetData = {
      asset_name: file.name,
      asset_type: "file",
      asset_size: file.size,
      asset_cid: uploadResult.cid,

      group_id: groupId,
      node_id: uploadResult.nodeId,
      extra_id: extraId,
    };

    let res2;

    if (!isTempUpload) {
      // 如果不是临时文件：请求创建：
      res2 = await this.httpService.getFileUploadURL({
        isLoggedIn: true,
        isFolder: true,
        assetData: {
          ...assetData,
          md5: md5,
          area_id: areaId,
        },
      });
    } else {
      // 外部上传没有登录的情况
      res2 = await this.httpService.getFileUploadURL({
        isLoggedIn: false,
        isFolder: true,
        assetData: {
          ...assetData,
          area_ids: areaId,
        },
      });
    }

    console.log(222, res2);

    // 处理返回结果
    if (res2.data.err && res2.data.err === 1017) {
      return onHandleData({
        code: 0,
        data: {
          cid: uploadResult.cid,
          isAlreadyExist: true,
          url: res2.data.assetDirectUrl,
        },
      });
    } else {
      return onHandleData({
        code: res2.code,
        data: {
          cid: uploadResult.cid,
        },
        msg: "Upload success",
      });
    }
  }



}

export default UploadLoader; 
