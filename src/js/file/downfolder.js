import { onHandleData, log } from "../errorHandler";
import Report from "../report";


class DownFolder {
    constructor(Http) {
        this.concurrentLimit = 3;
        this.progressCallback = null;
        this.chunkQueue = [];
        this.downloadedChunks = [];
        this.maxRetries = 3;
        this.failedChunks = [];
        this.report = new Report(Http);
        this.mimeType = "application/octet-stream";
    }


    async downloadFiles(url, fileName, controller, fileSize, updateProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.open("GET", url, true);
            xhr.responseType = "blob"; // 设置响应类型为 Blob

            xhr.onprogress = function (event) {
                let progress = (event.loaded / fileSize) * 100;

                if (progress > 100) {
                    progress = 100;
                }

                updateProgress(fileName, progress); // 反馈下载进度
            };

            xhr.onload = function () {
                if (xhr.status === 200) {
                    // 下载完成，处理下载
                    const link = document.createElement("a");
                    const blobUrl = window.URL.createObjectURL(xhr.response);
                    link.href = blobUrl;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    window.URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(link);
                    resolve({ code: 0, msg: "Download successful" }); // 返回成功结果
                } else {
                    reject({ code: -1, msg: "Download failed" + xhr.statusText }); // 返回成功结果
                }
            };

            xhr.onerror = function () {
                //下载过程中出现错误。
                reject({ code: -1, msg: "Download onerror" });
            };

            controller.signal.addEventListener("abort", () => {
                xhr.abort(); // 取消下载
                reject({ code: -1, msg: "Download abort" });
            });

            xhr.send(); // 发送请求
        });
    }


    async downloadFromMultipleUrls(
        urls,
        traceId,
        assetCid,
        fileName,
        fileSize,
        onProgress
    ) {
        const controller = new AbortController();
        let successfulDownload = false; // 标记是否成功下载
        const uploadResults = []; // 用于记录每个地址的上传结果

        const updateProgress = (fileName, progress) => {
            if (!successfulDownload) {
                if (onProgress) {
                    onProgress(progress.toFixed(2)); // 反馈进度
                }
            }
        };

        // 递归处理每个 URL
        const processUrl = async (index) => {
            if (index >= urls.length) {
                // 如果所有地址都已尝试，返回失败
                return { code: -1, msg: "All url download failed" };
            }

            const startTime = Date.now(); // 记录下载开始时间
            const url = urls[index];
            const parsedUrl = new URL(url);
            const nodeId = parsedUrl.hostname.split(".")[0];
            let attempts = 0;

            // 对当前 URL 进行最多 3 次重试
            while (attempts < 3 && !successfulDownload) {
                attempts++;
                try {
                    const result = await this.downloadFiles(
                        url + "&format=tar",
                        fileName + ".tar",
                        controller,
                        fileSize,
                        updateProgress
                    );
                    // 成功下载，取消其他下载
                    successfulDownload = true; // 标记下载成功
                    controller.abort();

                    const endTime = Date.now();
                    const elapsedTime = endTime - startTime; // 计算耗时（毫秒）
                    const transferRate = Math.floor((fileSize / elapsedTime) * 1000);

                    // 记录下载结果
                    uploadResults.push({
                        status: 1, // 状态：成功
                        msg: "successful",
                        elapsedTime: elapsedTime, // 下载耗时
                        transferRate: transferRate, // 传输速率
                        size: fileSize, // 文件大小
                        traceId: traceId,
                        nodeId: nodeId, // 使用 URL 的主机名作为 nodeId
                        cId: assetCid,
                        log: "",
                    });

                    this.report.creatReportData(uploadResults, "download");

                    return Promise.resolve(result); // 返回下载成功的结果
                } catch (error) {
                    // 记录失败并等待下一次重试
                    if (attempts >= 3) {
                        uploadResults.push({
                            status: 2, // 状态：失败
                            msg: "failed",
                            elapsedTime: 0,
                            transferRate: 0,
                            size: fileSize,
                            traceId: traceId,
                            nodeId: nodeId,
                            cId: assetCid,
                            log: { [nodeId]: error.message },
                        });

                        this.report.creatReportData(uploadResults, "download");
                    }
                }
            }

            // 当前 URL 失败，尝试下一个 URL
            return processUrl(index + 1);
        };

        const result = await processUrl(0); // 从第一个 URL 开始处理

        // 返回最终结果

        return successfulDownload ? result : onHandleData({
            code: -1,
            msg: "All url download failed " //如果所有地址下载都失败，返回错误信息
        });


    }
}

export default DownFolder;
