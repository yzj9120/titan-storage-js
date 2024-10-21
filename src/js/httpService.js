class HttpService {
  constructor(http) {
    this.Http = http;
  }
  /// Get upload address
  async getFileUploadURL(options) {
    const { isLoggedIn, isFolder, assetData, areaIds } = options;
    let url;
    // 判断是否已登录
    if (isLoggedIn) {
      if (isFolder) {
        // 已登录文件夹上传：创建资源
        url = "/api/v1/storage/create_asset";
        return await this.Http.postData(url, assetData);
      } else {
        // 已登录文件上传：获取上传地址
        url =
          "/api/v1/storage/get_upload_info?t=" + new Date().getTime() + "&need_trace=true&md5=" + assetData;
        if (areaIds && areaIds.length > 0) {
          const areaIdParams = areaIds
            .map((id) => `area_id=${encodeURIComponent(id)}`)
            .join("&");
          url += `&${areaIdParams}`;
        }
        return await this.Http.getData(url);
      }
    } else {
      if (isFolder) {
        // 未登录文件夹上传
        url = "/api/v1/storage/temp_file/upload";
        return await this.Http.postData(url, assetData);
      } else {
        // 未登录文件上传：获取上传地址
        url =
          "/api/v1/storage/temp_file/get_upload_file?t=" + new Date().getTime() + "&need_trace=true";
        if (areaIds && areaIds.length > 0) {
          const areaIdParams = areaIds
            .map((id) => `area_id=${encodeURIComponent(id)}`)
            .join("&");
          url += `&${areaIdParams}`;
        }
        return await this.Http.getData(url);;
      }
    }
  }

  ///Get download address
  async getFileDownURL(options) {
    const { assetCid, assetType, userId, areaId, hasTempFile, tempFileName } =
      options;
    let url;
    // 判断是否使用临时文件下载
    if (hasTempFile) {
      url = `/api/v1/storage/temp_file/download/${assetCid}`;
    }
    // 判断是否使用 userId 下载
    else if (userId) {
      url = `/api/v1/storage/open_asset?user_id=${userId}&asset_cid=${assetCid}`;
      if (areaId && areaId.length > 0) {
        const areaIdParams = areaId
          .map((id) => `area_id=${encodeURIComponent(id)}`)
          .join("&");
        url += `&${areaIdParams}`;
      }
    }
    // 默认使用 assetCid下载（登录）
    else {
      url = `/api/v1/storage/share_asset?asset_cid=${assetCid}`;
    }
    return await this.Http.getData(url);
  }

  // File details
  async getAssetGroupInfo(options = { cId: -1, groupId: -1 }) {
    if (options.cId) {
      return await this.Http.getData(
        `/api/v1/storage/get_asset_group_info?cid=${options.cId}`
      );
    } else if (options.groupId) {
      return await this.Http.getData(
        `/api/v1/storage/get_asset_group_info?groupid=${options.groupId}`
      );
    }
  }
  // Area list
  async getAreaIdList() {
    return await this.Http.getData("/api/v1/storage/get_area_id");
  }
  //Create group
  async createGroup(name, parent) {
    return await this.Http.getData(
      `/api/v1/storage/create_group?name=${encodeURIComponent(
        name
      )}&parent=${parent}`
    );
  }
  /// Get file list
  async onAssetGroupList(page, parent, pageSize) {
    return await this.Http.getData(
      `/api/v1/storage/get_asset_group_list?page=${page}&parent=${parent}&page_size=${pageSize}`
    );
  }
  /// Modify group name
  async renameGroup(options = { groupId: -1, name: "" }) {
    const body = {
      group_id: options.groupId,
      new_name: options.name,
    };
    return await this.Http.postData("/api/v1/storage/rename_group", body);
  }
  /// Modify file/folder name
  async renameAsset(options = { assetId: -1, name: "" }) {
    const body = {
      asset_cid: options.assetId,
      new_name: options.name,
    };
    return await this.Http.postData("/api/v1/storage/rename_group", body);
  }
  // Delete group
  async deleteGroup(options = { groupId: -1 }) {
    return await this.Http.getData(
      `/api/v1/storage/delete_group?group_id=${options.groupId}`
    );
  }
  // Delete file. File group.
  async deleteAsset(options = { assetId: -1, areaId: [] }) {
    let url = `/api/v1/storage/delete_asset?asset_cid=${options.assetId}`;
    if (options.areaId && options.areaId.length > 0) {
      const areaIdParams = options.areaId
        .map((id) => `area_id=${encodeURIComponent(id)}`)
        .join("&");
      url += `&${areaIdParams}`;
    }

    return await this.Http.getData(url);
  }
  // Get user information
  async userInfo() {
    const url1 = `/api/v1/storage/get_storage_size`;
    const data1 = await this.Http.getData(url1);
    const url2 = `/api/v1/storage/get_vip_info`;
    const data2 = await this.Http.getData(url2);
    const url3 = `/api/v1/storage/get_asset_count`;
    const data3 = await this.Http.getData(url3);
    const combinedData = {
      ...data1.data,
      ...data2.data,
      ...data3.data,
    };
    return {
      code: 0,
      data: combinedData,
    };
  }
  //Report
  async postReport(options) {
    return await this.Http.postData("/api/v1/storage/transfer/report", options);
  }

  //create_link
  async createLink(queryParam) {
    return await this.Http.getData("/api/v1/storage/create_link" + queryParam);
  }
  //share_status_set
  async shareStatusSet(queryParam) {
    return await this.Http.getData(
      "/api/v1/storage/share_status_set" + queryParam
    );
  }
  //share_link_info
  async shareLinkInfo(queryParam) {
    return await this.Http.getData(
      "/api/v1/storage/share_link_info" + queryParam
    );
  }
  //share_link_update
  async shareLinkUpdate(options) {
    return await this.Http.postData(
      "/api/v1/storage/share_link_update",
      options
    );
  }
  async uploadFile(uploadUrl, token, file, signal, onProgress) {
    return await this.Http.uploadFile(
      uploadUrl,
      token,
      file,
      null,
      onProgress,
      signal
    );
  }
}

export default HttpService;
