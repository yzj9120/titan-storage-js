import { onHandleError, log } from "./errorHandler";

class Downloader {
  constructor() {
    this.concurrentLimit = 3; // 并发限制数量
    this.progressCallback = null; // 进度回调函数
    this.chunkQueue = []; // 存储所有下载任务
    this.downloadedChunks = []; // 存储下载的 Blob 片段
    this.maxRetries = 3; // 每个片段的最大重试次数
    this.failedChunks = []; // 存储失败的片段
  }

  // 设置进度回调
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  // 检查 URL 是否可用
  async checkUrl(url) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch (error) {
      log("Error checking URL:", error);
      return false;
    }
  }

  // 下载单个片段并处理重试逻辑
  async downloadChunk(url, start, end, retries = 0) {
    try {
      const response = await fetch(url, {
        headers: {
          Range: `bytes=${start}-${end}`,
        },
      });

      if (response.ok) {
        const chunkBlob = await response.blob();
        this.downloadedChunks.push(chunkBlob); // 将下载的片段添加到数组
        return chunkBlob;
      } else {
        //下载片段失败
        throw new Error(`Failed to download chunk: ${start}-${end}`);
      }
    } catch (error) {
      if (retries < this.maxRetries) {
        //重试
        log(
          `Chunk download failed, retry attempt: ${
            retries + 1
          }, retrying chunk: ${start}-${end}`
        );

        await new Promise((resolve) => setTimeout(resolve, 1000)); // 重试间隔
        return this.downloadChunk(url, start, end, retries + 1); // 递归重试下载
      } else {
        this.failedChunks.push({ start, end }); // 记录失败的片段
        throw new Error(
          `Chunk download failed multiple times, abandoning chunk: ${start}-${end}`
        );
      }
    }
  }

  // 并发控制函数，动态分配剩余任务
  async concurrentDownload(urls, fileSize, chunkSize) {
    const availableUrls = urls.slice(); // 复制 URL 列表
    let downloadedSize = 0;
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // 初始化所有下载任务队列
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(fileSize - 1, (i + 1) * chunkSize - 1);
      this.chunkQueue.push({ start, end });
    }

    const downloadQueue = [];
    const activeDownloads = new Array(availableUrls.length).fill(false);

    // 下载进度反馈
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
      while (this.chunkQueue.length > 0) {
        const chunk = this.chunkQueue.shift(); // 从任务队列中取出一个任务
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

    // 启动并发下载
    for (let i = 0; i < availableUrls.length; i++) {
      if (i < this.concurrentLimit) {
        activeDownloads[i] = true;
        downloadQueue.push(downloadTask(availableUrls[i], i));
      }
    }

    // 等待所有下载完成
    await Promise.all(downloadQueue);

    // 处理缺失的片段
    if (this.failedChunks.length > 0) {
      // 重新下载缺失的片段
      await this.retryMissingChunks(this.failedChunks, availableUrls);
    }
  }

  // 重新下载缺失片段
  async retryMissingChunks(failedChunks, urls) {
    for (let chunk of failedChunks) {
      let success = false; // 跟踪是否成功下载了该片段
      for (let url of urls) {
        try {
          log(`re-download chunk ${chunk.start}-${chunk.end} from ${url}`);
          const chunkBlob = await this.downloadChunk(
            url,
            chunk.start,
            chunk.end
          );
          this.downloadedChunks.push(chunkBlob);
          success = true;
          break; // 成功后退出循环
        } catch (error) {
          log(
            `Failed to re-download chunk ${chunk.start}-${chunk.end} from ${url}:`,
            error
          );
        }
      }
      if (!success) {
        log(
          `re-download chunk ${chunk.start}-${chunk.end} All attempts have failed.`
        );
      }
    }
  }

  // 合并 Blob 片段
  mergeChunks(chunks) {
    return new Blob(chunks);
  }

  // 主下载方法
  async downloadFile(urls, fileName, fileSize) {
    const chunkSize = Math.ceil(fileSize / urls.length);

    try {
      await this.concurrentDownload(urls, fileSize, chunkSize);

      const finalBlob = this.mergeChunks(this.downloadedChunks);

      const downloadUrl = window.URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      return { code: 0, msg: "Download successful" };
    } catch (error) {
      return { code: -1, msg: "Download failed" };
    }
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
          reject(new Error("下载失败:" + xhr.statusText));
        }
      };

      xhr.onerror = function () {
        reject(new Error("下载过程中出现错误。"));
      };

      controller.signal.addEventListener("abort", () => {
        xhr.abort(); // 取消下载
        reject(new Error("下载已被取消。"));
      });

      xhr.send(); // 发送请求
    });
  }

  // 批量下载同一个文件
  async downloadFromMultipleUrls(urls, fileName, fileSize, onProgress) {
    const controller = new AbortController();
    const downloadPromises = [];
    let successfulDownload = false; // 标记是否成功下载
    let maxProgress = 0; // 记录最大的进度

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

    for (const url of urls) {
      const downloadPromise = async () => {
        let attempts = 0;
        while (attempts < 3) {
          if (successfulDownload) return; // 如果已成功下载，跳过

          try {
            const result = await this.downloadFiles(
              url + "&format=tar",
              fileName + ".tar",
              controller,
              fileSize,
              updateProgress
            );

            // 下载完成，取消其他下载
            successfulDownload = true; // 标记下载成功
            controller.abort();
            console.log(`${fileName} 下载完成，取消其他下载。`);
            return result; // 返回下载成功的结果
          } catch (error) {
            attempts++;
            if (successfulDownload) return; // 如果已成功下载，跳出重试循环
            console.error(`尝试 ${attempts} 下载失败: ${error.message}`);
            if (attempts >= 3) {
              return { code: -1, msg: "Download failed" }; // 返回下载失败的结果
            }
          }
        }
      };

      downloadPromises.push(downloadPromise());
    }

    const results = await Promise.all(downloadPromises); // 等待所有下载完成

    // 如果有成功的下载，返回第一个成功的结果，否则返回失败结果
    return successfulDownload
      ? results.find((result) => result && result.code === 0)
      : { code: -1, msg: "所有下载均失败" };
  }
}

export default Downloader;
