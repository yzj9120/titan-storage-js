import StatusCodes from "./codes";
import { log, onHandleData } from "./errorHandler";


export class Http {
  constructor(token, url, debug = false) {
    this.token = token;
    this.url = url;
    this.debug = debug;
    // dev
    // this.url = "/apis";
    // build

    if (!this.url) {
      this.url = "https://storage-test.titannet.io";
    }
    if (!token || token.trim() === "") {
      log(StatusCodes.API_KEY_EMPTY, "");
    }
  }

  checkLanguage() {
    const language = navigator.language || navigator.userLanguage;
    const storedLang = localStorage.getItem("ttStorageLanguage");

    if (storedLang) {
      return storedLang;
    }

    if (language.includes("zh")) {
      return "cn";
    } else if (language.includes("en")) {
      return "en";
    } else {
      return "";
    }
  }


  updateToken(newToken) {
    if (newToken && newToken.trim() !== "") {
      this.token = newToken;
      return onHandleData({ code: StatusCodes.SUCCESSFULLY });
    } else {
      return onHandleData({ code: StatusCodes.FAILURE });
    }
  }

  updateLanguage(language) {
    if (language && language.trim() !== "") {
      localStorage.setItem("ttStorageLanguage", language)
      return onHandleData({ code: StatusCodes.SUCCESSFULLY });
    } else {
      return onHandleData({ code: StatusCodes.FAILURE });
    }
  }


  getData(endpoint) {
    const requestUrl = `${this.url}${endpoint}`;

    if (!this.token || this.token.trim() === "") {
      return onHandleData({ code: StatusCodes.API_KEY_EMPTY });
    }
    log("Fetching data from URL:", requestUrl);

    const lang = this.checkLanguage();
    const headers = {
      "Content-Type": "application/json",
      lang: lang,
    };
    if (this.token != "token") {
      headers["JwtAuthorization"] = "Bearer " + this.token;
    }

    return fetch(requestUrl, {
      method: "GET",
      headers: headers,
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          return response.text().then((errorText) => {
            return onHandleData({
              code: response.status,
              msg: errorText ?? "",
            });
          });
        }
      })
      .then((res) => {
        log("fetched successfully:", res);
        const { code, msg, data, ...otherFields } = res; // 解构出 code, msg 和 data

        return onHandleData({
          code: code,
          msg: msg ?? "",
          data: {
            ...data,
            ...otherFields, // 将其他字段添加到data中
          },
        });
        // return res;
      })
      .catch((error) => {
        return onHandleData({ code: StatusCodes.FETCH_ERROR, msg: error });
      });
  }
  postData(endpoint, body) {
    const requestUrl = `${this.url}${endpoint}`;
    if (!this.token || this.token.trim() === "") {
      return onHandleData({ code: StatusCodes.API_KEY_EMPTY });
    }
    log("Posting data to URL:", requestUrl);

    const lang = this.checkLanguage();
    const headers = {
      "Content-Type": "application/json",
      lang: lang,
    };
    if (this.token != "token") {
      headers["JwtAuthorization"] = "Bearer " + this.token;
    }
    return fetch(requestUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          // 返回错误状态码和文本
          return response.text().then((errorText) => {
            // 处理特定的 HTTP 错误
            const errorMessage = `Error ${response.status}: ${errorText}`;
            var res = onHandleData({
              code: response.status,
              msg: errorMessage,
            });
            return Promise.reject(res);
          });
        }
      })
      .then((res) => {
        log("Data posted successfully:", res);

        const { code, msg, data, ...otherFields } = res; // 解构出 code, msg 和 data


        return onHandleData({
          code: code,
          msg: msg ?? "",
          data: {
            ...(Array.isArray(data) ? { List: data } : data), // 如果 data 是数组，添加 list 字段
            ...otherFields, // 将其他字段添加到data中
          },
        });

        // return onHandleData({ code: res.code, msg: res.msg ?? "", data: res.data });
        //return res;
      })
      .catch((error) => {
        log("Data posted error:", error);
        // 捕获网络错误和 Promise.reject 中的错误
        return onHandleData({ code: StatusCodes.FETCH_ERROR, msg: error });
      });
  }

  /**
   * Uploads a file to a specified endpoint with additional data and tracks progress.
   *
   * @param {string} endpoint - The URL to which the file will be uploaded.
   * @param {string} token - The authentication token for the upload request.
   * @param {File} file - The file to be uploaded.
   * @param {Object} [additionalData={}] - Additional data to be included in the request.
   * @param {Function} onProgress - Callback function to report progress, receives three parameters: bytes uploaded, total bytes, and percentage.
   * @param {AbortSignal} [signal] - Optional signal to abort the request.
   * @returns {Promise<Object>} - A promise that resolves with the upload result or rejects with an error.
   */

  uploadFile(endpoint, uptoken, file, additionalData = {}, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const requestUrl = `${endpoint}`;
      if (!this.token || this.token.trim() === "") {
        return onHandleData({ code: StatusCodes.API_KEY_EMPTY });
      }
      var size = 0;
      xhr.open("POST", requestUrl, true);
      xhr.setRequestHeader("JwtAuthorization", "Bearer " + this.token);
      xhr.setRequestHeader("Authorization", "Bearer " + uptoken);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          size = event.total;
          const percentComplete = (event.loaded / event.total) * 100;
          onProgress(event.loaded, event.total, percentComplete);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const responseData = JSON.parse(xhr.responseText);
          log("File uploaded successfully:", responseData);
          if (onProgress) {
            onProgress(size, size, 100);
          }
          resolve(responseData);
        } else {
          log("File uploaded:", xhr.status);
          reject(onHandleData({ code: xhr.status, msg: xhr.responseText }));
        }
      };
      // Handle errors
      xhr.onerror = () => {
        const errorMessage = `File upload failed: ${xhr.statusText || "Handle network errors"
          }`;
        reject(onHandleData(StatusCodes.FETCH_ERROR, errorMessage));
      };

      // Handle request abortion
      signal.addEventListener("abort", () => {
        xhr.abort();
        // reject(
        //   onHandleError(StatusCodes.FETCH_ERROR, "Upload aborted")
        // );
      });

      const formData = new FormData();
      formData.append("file", file);

      for (const key in additionalData) {
        if (additionalData.hasOwnProperty(key)) {
          formData.append(key, additionalData[key]);
        }
      }
      xhr.send(formData);
    });
  }


}
