import { onHandleData, log } from "./errorHandler";
import Report from "./report";

class SimpleLock {
  constructor() {
    this._locked = false;
    this._waiting = [];
  }

  async acquire() {
    while (this._locked) {
      await new Promise((resolve) => this._waiting.push(resolve));
    }
    this._locked = true;
  }

  release() {
    this._locked = false;
    if (this._waiting.length > 0) {
      const nextResolve = this._waiting.shift();
      nextResolve();
    }
  }
}

class Downloader {
  constructor(Http) {
    this.concurrentLimit = 3;
    this.progressCallback = null;
    this.chunkQueue = [];
    this.downloadedChunks = [];
    this.maxRetries = 3;
    this.failedChunks = [];
    this.report = new Report(Http);
    this.mimeType = "application/octet-stream";
    this.lock = new SimpleLock();
    this.paused = false; // 添加暂停状态
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  async checkUrl(url) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch (error) {
      log("Error checking URL:", error);
      return false;
    }
  }

  async downloadChunk(url, start, end, retries = 0) {
    try {
      const response = await fetch(url, {
        headers: {
          Range: `bytes=${start}-${end}`,
        },
      });

      if (response.ok) {
        const chunkBlob = await response.blob();
        const expectedSize = end - start + 1;

        log(
          `Downloading chunk ${start}-${end}: expected size ${expectedSize}, actual size ${chunkBlob.size}`
        );
        if (chunkBlob.size !== expectedSize) {
          throw new Error(
            `Chunk size mismatch: expected ${expectedSize}, but got ${chunkBlob.size}`
          );
        }

        this.downloadedChunks.push({ start, blob: chunkBlob });
        this.mimeType = response.headers.get("Content-Type");
        return chunkBlob;
      } else {
        throw new Error(
          `Failed to download chunk: ${start}-${end}, status: ${response.status}`
        );
      }
    } catch (error) {
      console.log(111, retries);
      if (retries < this.maxRetries) {
        log(
          `Chunk download failed, retrying attempt ${
            retries + 1
          } for chunk ${start}-${end}`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Retry delay
        return this.downloadChunk(url, start, end, retries + 1);
      } else {
        // 达到最大重试次数时，记录失败块，并返回失败信息
        this.failedChunks.push({ start, end });

        // 返回失败结果，并阻止进一步下载
        return onHandleData({
          code: StatusCodes.FAILURE,
          msg: `Chunk download failed after ${this.maxRetries} attempts: ${start}-${end}`,
        });
      }
    }
  }

  async downloadFile(urls, traceId, assetCid, fileName, fileSize) {
    const chunkSize = Math.ceil(fileSize / urls.length);

    console.log("chunkSize", fileSize + "----" + chunkSize);
    const uploadResults = [];
    try {
      const startTime = Date.now();
      await this.concurrentDownload(urls, fileSize, chunkSize);

      // 检查所有下载的块（chunk）是否完整
      const allChunksComplete = this.downloadedChunks.every((chunk, index) => {
        const expectedSize =
          index < urls.length - 1 ? chunkSize : fileSize % chunkSize;
        return chunk.blob.size === expectedSize;
      });

      if (!allChunksComplete) {
        log(`Some chunks were incomplete. Retrying...`);
        await this.retryMissingChunks(this.failedChunks, urls);
      }

      const finalBlob = this.mergeChunks(this.downloadedChunks, this.mimeType);
      if (finalBlob.size !== fileSize) {
        throw new Error(
          `File size mismatch: expected ${fileSize}, but got ${finalBlob.size}`
        );
      }

      // Create download link
      const downloadUrl = window.URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      const endTime = Date.now();
      const elapsedTime = endTime - startTime;
      const transferRate = Math.floor((fileSize / elapsedTime) * 1000);

      urls.forEach((url) => {
        const parsedUrl = new URL(url);
        const nodeId = parsedUrl.hostname.split(".")[0];
        uploadResults.push({
          status: 1,
          msg: "successful",
          elapsedTime: elapsedTime,
          transferRate: transferRate,
          size: fileSize,
          traceId: traceId,
          nodeId: nodeId,
          cId: assetCid,
          log: "",
        });
      });
      this.report.creatReportData(uploadResults, "download");
      return Promise.resolve({ code: 0, msg: "Download successful" });
    } catch (error) {
      // Handle error reporting
      urls.forEach((url) => {
        const parsedUrl = new URL(url);
        const nodeId = parsedUrl.hostname.split(".")[0];
        uploadResults.push({
          status: -1,
          msg: error.message,
          elapsedTime: -1,
          transferRate: -1,
          size: fileSize,
          traceId: traceId,
          nodeId: nodeId,
          cId: assetCid,
          log: error.stack || "",
        });
      });
      this.report.creatReportData(uploadResults, "download");
      return onHandleData({
        code: StatusCodes.FAILURE,
        msg: "Download failed: " + error,
      });
    }
  }

  async concurrentDownload(urls, fileSize, chunkSize) {
    const availableUrls = urls.slice();
    let downloadedSize = 0;
    const totalChunks = Math.ceil(fileSize / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(fileSize - 1, (i + 1) * chunkSize - 1);
      this.chunkQueue.push({ start, end });
    }

    const downloadQueue = [];
    const activeDownloads = new Array(availableUrls.length).fill(false);

    const updateProgress = () => {
      const percentage = Math.min(
        100,
        (downloadedSize / fileSize) * 100
      ).toFixed(2);
      if (this.progressCallback) {
        this.progressCallback(percentage);
      }
    };

    const downloadTask = async (url, urlIndex) => {
      while (true) {
        let chunk;
        await this.lock.acquire(); // Ensure proper locking
        if (this.chunkQueue.length > 0) {
          chunk = this.chunkQueue.shift();
        }
        this.lock.release();

        if (!chunk) break;

        try {
          const chunkBlob = await this.downloadChunk(
            url,
            chunk.start,
            chunk.end
          );
          downloadedSize += chunkBlob.size;
          updateProgress();
        } catch (error) {
          log(
            `Failed to download chunk ${chunk.start}-${chunk.end} from ${url}:`,
            error
          );
        }
      }
      activeDownloads[urlIndex] = false;
    };

    for (let i = 0; i < availableUrls.length; i++) {
      if (i < this.concurrentLimit) {
        activeDownloads[i] = true;
        downloadQueue.push(downloadTask(availableUrls[i], i));
      }
    }

    await Promise.all(downloadQueue);

    // if (this.failedChunks.length > 0) {
    //   log(`Retrying failed chunks...`);
    //   await this.retryMissingChunks(this.failedChunks, availableUrls);
    // }
  }

  async retryMissingChunks(failedChunks, urls) {
    console.log("失败的快", failedChunks);
    for (let chunk of failedChunks) {
      let success = false;
      for (let url of urls) {
        try {
          log(`Re-download chunk ${chunk.start}-${chunk.end} from ${url}`);
          const chunkBlob = await this.downloadChunk(
            url,
            chunk.start,
            chunk.end
          );
          this.downloadedChunks.push({ start: chunk.start, blob: chunkBlob });
          success = true;
          break;
        } catch (error) {
          log(
            `Failed to re-download chunk ${chunk.start}-${chunk.end} from ${url}:`,
            error
          );
        }
      }
      if (!success) {
        log(
          `Re-download chunk ${chunk.start}-${chunk.end} failed after all attempts.`
        );
      }
    }
  }

  mergeChunks(chunks, mimeType) {
    const sortedChunks = chunks.sort((a, b) => a.start - b.start);
    const mergedBlob = new Blob(
      sortedChunks.map((chunk) => chunk.blob),
      { type: mimeType }
    );
    return mergedBlob;
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

  // 下载文件夹
  //   async downloadFromMultipleUrls(
  //     urls,
  //     traceId,
  //     assetCid,
  //     fileName,
  //     fileSize,
  //     onProgress
  //   ) {
  //     const controller = new AbortController();
  //     const downloadPromises = [];
  //     let successfulDownload = false; // 标记是否成功下载
  //     let maxProgress = 0; // 记录最大的进度
  //     const uploadResults = []; // 用于记录每个地址的上传结果

  //     const updateProgress = (fileName, progress) => {
  //       if (!successfulDownload) {
  //         // 更新最大进度
  //         if (progress > maxProgress) {
  //           maxProgress = progress;
  //           if (onProgress) {
  //             onProgress(maxProgress.toFixed(2)); // 反馈最大进度
  //           }
  //         }
  //       }
  //     };

  //     for (const url of urls) {
  //       const startTime = Date.now(); // 记录上传开始时间
  //       const parsedUrl = new URL(url);
  //       const nodeId = parsedUrl.hostname.split(".")[0];
  //       const downloadPromise = async () => {
  //         let attempts = 0;
  //         while (attempts < 3) {
  //           if (successfulDownload) return; // 如果已成功下载，跳过

  //           try {
  //             const result = await this.downloadFiles(
  //               url + "&format=tar",
  //               fileName + ".tar",
  //               controller,
  //               fileSize,
  //               updateProgress
  //             );
  //             // 下载完成，取消其他下载
  //             successfulDownload = true; // 标记下载成功
  //             controller.abort();
  //             // console.log(`${fileName} 下载完成，取消其他下载。`);
  //             const endTime = Date.now();
  //             const elapsedTime = endTime - startTime; // 计算耗时（毫秒）
  //             const transferRate = Math.floor((fileSize / elapsedTime) * 1000);
  //             // 记录上传结果
  //             uploadResults.push({
  //               status: 1, // 状态：成功或失败
  //               msg: "successful",
  //               elapsedTime: elapsedTime, // 上传耗时
  //               transferRate: transferRate, // 传输速率
  //               size: fileSize, // 文件大小
  //               traceId: traceId,
  //               nodeId: nodeId, // 可以使用 URL 作为 nodeId
  //               cId: assetCid,
  //               log: "",
  //             });
  //             this.report.creatReportData(uploadResults, "download");

  //             return Promise.resolve(result);

  //             // 返回下载成功的结果
  //           } catch (error) {
  //             attempts++;
  //             if (successfulDownload) return; // 如果已成功下载，跳出重试循环
  //             //console.error(`尝试 ${attempts} 下载失败: ${error.message}`);
  //             if (attempts >= 3) {
  //               uploadResults.push({
  //                 status: 2,
  //                 msg: "failed",
  //                 elapsedTime: 0,
  //                 transferRate: 0,
  //                 size: fileSize,
  //                 traceId: traceId,
  //                 nodeId: nodeId,
  //                 cId: assetCid,
  //                 log: { [nodeId]: error },
  //               });
  //               this.report.creatReportData(uploadResults, "download");
  //               return { code: -1, msg: "Download failed" }; // 返回下载失败的结果
  //             }
  //           }
  //         }
  //       };

  //       downloadPromises.push(downloadPromise());
  //     }

  //     const results = await Promise.allSettled(downloadPromises); // 等待所有下载完成

  //     return successfulDownload
  //       ? results.find(
  //           (result) =>
  //             result.status === "fulfilled" &&
  //             result.value &&
  //             result.value.code === 0
  //         )?.value || { code: -1, msg: "No successful download result found" } // 返回找到的结果的 value // 如果未找到有效的 value
  //       : { code: -1, msg: "All url download failed" };
  //   }

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
    let maxProgress = 0; // 记录最大的进度
    const uploadResults = []; // 用于记录每个地址的上传结果

    const updateProgress = (fileName, progress) => {
      if (!successfulDownload) {
        // 更新最大进度
        if (progress > maxProgress) {
          maxProgress = progress;
          if (onProgress) {
            onProgress(maxProgress.toFixed(2)); // 反馈最大进度
          }
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
    return successfulDownload
      ? result // 如果成功下载，返回下载结果
      : { code: -1, msg: "All url download failed" }; // 如果所有地址下载都失败，返回错误信息
  }
}

export default Downloader;
