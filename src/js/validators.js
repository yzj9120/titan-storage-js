import StatusCodes from "./codes";
import { onHandleError } from "./errorHandler";

export const Validator = {
  validateApiKey(appkey) {
    if (!appkey || appkey.trim() === "") {
      return onHandleError(
        StatusCodes.API_KEY_EMPTY,
        "API token is required and cannot be empty."
      );
    }
  },
  validateGroupName(name) {
    if (!name || name.trim() === "") {
      return onHandleError(
        StatusCodes.FILE_NAME_KEY_EMPTY,
        "Group name cannot be empty."
      );
    }
  },

  validateAssetCid(assetCid) {
    if (!assetCid || assetCid.trim() === "") {
      return onHandleError(
        StatusCodes.ASSEST_ID_ERROR,
        "assetCid cannot be empty."
      );
    }
  },

  validateAssetId(assetId) {
    if (!assetId || assetId.trim() === "") {
      return onHandleError(
        StatusCodes.ASSEST_ID_ERROR,
        "Asset ID is required."
      );
    }
  },

  validateAreaId(id) {
    if (!Array.isArray(id)) {
      return onHandleError(
        StatusCodes.AREA_ID_ERROR,
        "area_id should be an array."
      );
    }
  },

  validateGroupId(id) {
    if (!Number.isInteger(id) || id < 0) {
      return onHandleError(
        StatusCodes.Group_ID_ERROR,
        "group_id should be a non-negative integer"
      );
    }
  },

  validateAssetType(type) {
    if (type !== 0 && type !== 1) {
      return onHandleError(
        StatusCodes.Asset_Type_ERROR,
        "asset_type should be 0 or 1."
      );
    }
  },

  validateParentId(parent) {
    if (typeof parent !== "number" || parent < 0) {
      return onHandleError(
        StatusCodes.PARENT_ID_INVALID,
        "Parent ID is invalid."
      );
    }
  },
  validatePage(page) {
    if (typeof page !== "number" || page <= 0) {
      return onHandleError(StatusCodes.PAGE_ERROR, "Page number is invalid.");
    }
  },
  validatePageSize(pageSize) {
    if (typeof pageSize !== "number" || pageSize <= 0) {
      return onHandleError(StatusCodes.PAGESIZE_ERROR, "Page size is invalid.");
    }
  },
  validateShortPass(shortPass) {
    if (shortPass) {
      const shortPassRegex = /^[a-zA-Z0-9]{6}$/;
      if (!shortPassRegex.test(shortPass)) {
        return onHandleError(
          StatusCodes.INVALID_PASSWORD,
          "Short password is invalid. It must be 6 characters long and can only contain letters and numbers."
        );
      }
    }
  },
  validateExpireAt(expireAt) {
    if (expireAt) {
      // 验证是否是正整数
      const isPositiveInteger = Number.isInteger(expireAt) && expireAt > 0;
      if (!isPositiveInteger) {
        return onHandleError(
          StatusCodes.INVALID_EXPIRE_AT,
          "expireAt must be a positive integer."
        );
      }
    }
  }
  ,
  validateShareStatus(shareStatus) {
    if (![0, 1].includes(shareStatus)) {
      return onHandleError(StatusCodes.SHARE_ERROE, "Share status is invalid.");
    }
  },
};
