import StatusCodes from "./codes";
import { log, onHandleError } from "./errorHandler";

export class Http {
  constructor(token, url, debug = false) {
    this.token = token;
    this.url = url;
    this.debug = debug;
    // dev
    // this.url = "/apis";
    // build

    if (!this.url) {
      this.url = "https://api-test1.container1.titannet.io";
    }
    if (!token || token.trim() === "") {
      log(StatusCodes.API_KEY_EMPTY, "");
    }
  }

  updateToken(newToken) {
    if (newToken && newToken.trim() !== "") {
      this.token = newToken;
      return {
        code: 0,
        msg: "PI token updated successfully",
        data: {}
      }
    } else {
      return onHandleError(StatusCodes.API_KEY_EMPTY,
        "Failed to update API key. New API token is empty.");
    }
  }

  getData(endpoint) {
    const requestUrl = `${this.url}${endpoint}`;

    if (!this.token || this.token.trim() === "") {
      return onHandleError(StatusCodes.API_KEY_EMPTY, "");
    }
    log("Fetching data from URL:", requestUrl);

    return fetch(requestUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "JwtAuthorization": "Bearer " + this.token,
      },
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          return response.text().then((errorText) => {
            onHandleError(response.status, errorText);
          });
        }
      })
      .then((data) => {
        log("Data fetched successfully:", data);
        return data;
      })
      .catch((error) => {
        return onHandleError(StatusCodes.FETCH_ERROR, error.message);
      });
  }
  postData(endpoint, body) {
    const requestUrl = `${this.url}${endpoint}`;
    if (!this.token || this.token.trim() === "") {
      return onHandleError(StatusCodes.API_KEY_EMPTY, "");
    }
    log("Posting data to URL:", requestUrl);
    return fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "JwtAuthorization": "Bearer " + this.token,
      },
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
            return Promise.reject(onHandleError(response.status, errorMessage));
          });
        }
      })
      .then((data) => {
        log("Data posted successfully:", data);
        return data;
      })
      .catch((error) => {
        log("Data posted error:", error);
        // 捕获网络错误和 Promise.reject 中的错误
        return onHandleError(StatusCodes.FETCH_ERROR, error.message);
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
        return onHandleError(StatusCodes.API_KEY_EMPTY, "");
      }
      xhr.open("POST", requestUrl, true);
      xhr.setRequestHeader("JwtAuthorization", "Bearer " + this.token);
      xhr.setRequestHeader("Authorization", "Bearer " + uptoken);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percentComplete = (event.loaded / event.total) * 100;
          onProgress(event.loaded, event.total, percentComplete);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const responseData = JSON.parse(xhr.responseText);
          log("File uploaded successfully:", responseData);
          resolve(responseData);
        } else {
          log("File uploaded:", xhr.status);
          reject(onHandleError(xhr.status, xhr.responseText));
        }
      };
      // Handle errors
      xhr.onerror = () => {
        const errorMessage = `File upload failed: ${xhr.statusText || "Handle network errors"}`;
        reject(
          onHandleError(StatusCodes.FETCH_ERROR, errorMessage)
        );
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