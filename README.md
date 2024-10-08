Here’s the text translated to English:

---

### Titan Storage Web SDK
The Titan Storage Web SDK provides functionalities for file uploading, downloading, deleting, renaming, sharing, and creating folders.

The Web SDK consists of TitanStorage.

#### TitanStorage Object
| Method                            | Description                                    |
|-----------------------------------|------------------------------------------------|
| TitanStorage.initSdk              | Initialize the SDK                             |
| TitanStorage.getAreaId           | Retrieve the list of area IDs from the scheduler |
| TitanStorage.createGroup          | Create directories, including root and subdirectories |
| TitanStorage.getAssetGroupList    | Retrieve a list of all folders and files      |
| TitanStorage.renameGroup          | Rename a specific folder                       |
| TitanStorage.renameAsset          | Rename a specific file                         |
| TitanStorage.deleteGroup          | Delete a specific folder                       |
| TitanStorage.deleteAsset          | Delete a specific file                         |
| TitanStorage.userInfo             | Retrieve user-related information              |
| TitanStorage.getAssetGroupInfo    | Get detailed information about files/folders   |
| TitanStorage.share                | Share file/folder data                         |
| TitanStorage.fileUpload           | Upload files/folders                           |
| TitanStorage.fileDownLoad         | Download files/folders                         |

### Error Codes
Below are the potential errors that the SDK may throw. Please refer to the table for handling suggestions.

| Error Code | Description                       | Possible Causes and Suggestions                      |
|------------|-----------------------------------|-----------------------------------------------------|
| 10001      | SDK Initialization Exception      | Generally caused by an incorrect app key; check console logs for details. |
| 10002      | SDK Initialization Failed         | Generally indicates an exception during SDK initialization; check console logs. |
| 10005      | File or Folder Name Error        | Generally due to incorrect parameters; check console logs. |
| 10006      | ID Parameter Error               | Generally due to incorrect parameters; check console logs. |
| 10007      | Share Failed                     | Generally due to unsupported sharing; check console logs. |
| 10008      | Data Format Error                | Generally indicates a data format error; check console logs. |
| 10009      | Incorrect Share Password          | Generally indicates a data format error; check console logs. |
| 100010     | Server Request Exception          | Generally due to request errors; contact technical support. |
| 100011     | Request Parameter Error           | Check console logs for details.                      |
| 100012     | Invalid Parameter                 | Generally due to request errors; check console logs. |
| 100013     | Invalid Parameter                 | Generally due to request errors; check console logs. |
| 100014     | Missing Request Parameter Field   | Check console logs for details.                      |
| 100015     | Upload Failed                     | Check console logs for details.                      |
| 100016     | Incorrect Area ID                 | Generally due to incorrect parameter type; check console logs. |
| 100017     | Incorrect Node D                  | Generally indicates the parameter was not found; check console logs. |
| 100018     | File Type Not Found               | Check console logs for details.                      |
| 100019     | Download Address Error            | Server returned an incorrect or unusable address; check console logs. |
| 100020     | Download Exception                | Check console logs for details.                      |
| 100021     | Incorrect File ID Verification     | Check console logs for details.                      |
| 100022     | Download Type Not Found           | Check console logs for details.                      |
| 99999      | Unknown Error                    |                                                       |

--- 

