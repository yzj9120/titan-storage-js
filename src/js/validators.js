import StatusCodes from "./codes";
import { onHandleData } from "./errorHandler";

export const Validator = {
  validateApiKey(appkey) {
    if (!appkey || appkey.trim() === "") {
      return onHandleData({ code: StatusCodes.API_KEY_EMPTY });
    }
  },
  validateGroupName(name) {
    if (!name || name.trim() === "") {
      return onHandleData({ code: StatusCodes.FILE_NAME_KEY_EMPTY, msg: "Group name cannot be empty." });
    }
  },

  validateAssetCid(assetCid) {
    if (!assetCid || assetCid.trim() === "") {

      return onHandleData({ code: StatusCodes.ASSEST_ID_ERROR, msg: "AssetCid cannot be empty." });
    }
  },

  validateAssetId(assetId) {
    if (!assetId || assetId.trim() === "") {

      return onHandleData({ code: StatusCodes.ASSEST_ID_ERROR, msg: "Asset ID is required." });
    }
  },

  validateAreaId(id) {
    if (!Array.isArray(id)) {
      return onHandleData({ code: StatusCodes.AREA_ID_ERROR, msg: "Asset_ID should be an array." });

    }
  },

  validateGroupId(id) {
    if (!Number.isInteger(id)) {
      return onHandleData({ code: StatusCodes.Group_ID_ERROR, msg: "group_id should be a non-negative intege." });
    }
  },

  validateAssetType(type) {
    if (type !== 0 && type !== 1) {
      return onHandleData({ code: StatusCodes.Asset_Type_ERROR, msg: "asset_type should be 0 or 1." });
    }
  },

  validateAssetFile(fileSize) {
    // 验证文件大小是否大于 100M
    if (fileSize > 104857600) {

      return onHandleData({ code: StatusCodes.File_Size_ERROR, msg: "file size should not exceed 100MB." });

      
    }
  },

  validateParentId(parent) {
    if (typeof parent !== "number" || parent < 0) {

      return onHandleData({ code: StatusCodes.PARENT_ID_INVALID, msg: "Parent ID is invalid." });
    }
  },
  validatePage(page) {
    if (typeof page !== "number" || page <= 0) {

      return onHandleData({ code: StatusCodes.PAGE_ERROR, msg: "Page number is invalid." });

    }
  },
  validatePageSize(pageSize) {
    if (typeof pageSize !== "number" || pageSize <= 0) {
      return onHandleData({ code: StatusCodes.PAGESIZE_ERROR, msg: "Page size is invalid." });

    }
  },
  validateShortPass(shortPass) {
    if (shortPass) {
      const shortPassRegex = /^[a-zA-Z0-9]{6}$/;
      if (!shortPassRegex.test(shortPass)) {

        return onHandleData({ code: StatusCodes.INVALID_PASSWORD, msg: "hort password is invalid. It must be 6 characters long and can only contain letters and numbers." });
      }
    }
  },
  validateExpireAt(expireAt) {
    if (expireAt) {
      // 验证是否是正整数
      const isPositiveInteger = Number.isInteger(expireAt) && expireAt > 0;
      if (!isPositiveInteger) {

        return onHandleData({ code: StatusCodes.INVALID_EXPIRE_AT, msg: "expireAt must be a positive integer" });
      }
    }
  }
  ,
  validateShareStatus(shareStatus) {
    if (![0, 1].includes(shareStatus)) {
      return onHandleData({ code: StatusCodes.SHARE_ERROE, msg: "Share status is invalid" });
    }
  },
  // 验证上传参数
  validateUploadOptions(file, areaId, groupId, assetType) {
    const validators = [
      { fn: Validator.validateAreaId, value: areaId },
      { fn: Validator.validateGroupId, value: groupId },
      { fn: Validator.validateAssetType, value: assetType },
    ];

    // 额外验证文件大小
    if (groupId === -1 && Validator.validateAssetFile(file.size))
      return Validator.validateAssetFile(file.size);

    for (const { fn, value } of validators) {
      const result = fn(value);
      if (result) return result; // 返回验证失败信息
    }
    return null; // 所有验证通过
  }

};
