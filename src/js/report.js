import { log, onHandleError } from "./errorHandler";
import StatusCodes from "./codes";

class Report {
  constructor(Http) {
    this.Http = Http;
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
  creatReportData(uploadResults, type) {
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
    const transferType = type;
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

export default Report;
