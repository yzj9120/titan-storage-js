Here’s the text translated to English:

---

### Titan Storage Web SDK
The Titan Storage Web SDK provides functionalities for file uploading, downloading, deleting, renaming, sharing, and creating folders.

The Web SDK consists of TitanStorage.

#### TitanStorage Object
| Method                            | Description                                    |
|-----------------------------------|------------------------------------------------|
| TitanStorage.initialize              | Initialize the SDK                             |
| TitanStorage.listRegions           | Retrieve the list of area IDs from the scheduler |
| TitanStorage.createFolder          | Create directories, including root and subdirectories |
| TitanStorage.listDirectoryContents    | Retrieve a list of all folders and files      |
| TitanStorage.renameFolder          | Rename a specific folder                       |
| TitanStorage.renameAsset          | Rename a specific file                         |
| TitanStorage.deleteFolder          | Delete a specific folder                       |
| TitanStorage.deleteAsset          | Delete a specific file                         |
| TitanStorage.getUserProfile             | Retrieve user-related information              |
| TitanStorage.getltemDetails    | Get detailed information about files/folders   |
| TitanStorage.createSharedLink                | Share file/folder data                         |
| TitanStorage.uploadAsset           | Upload files/folders                           |
| TitanStorage.downloadAsset         | Download files/folders                         |

### Error Codes
Below are the potential errors that the SDK may throw. Please refer to the table for handling suggestions.

| Error Code | Description                       | Possible Causes and Suggestions                      |
|------------|-----------------------------------|-----------------------------------------------------|
| 1001      | SDK Initialization Exception      | Generally caused by an incorrect app key; check console logs for details. |
| 1002      | SDK Initialization Failed         | Generally indicates an exception during SDK initialization; check console logs. |
| 1005      | File or Folder Name Error         | Generally due to incorrect parameters; check console logs. |
| 1006      | ID Parameter Error                | Generally due to incorrect parameters; check console logs. |
| 1007      | Share Failed                     | Generally due to unsupported sharing; check console logs. |
| 1008      | Data Format Error                | Generally indicates a data format error; check console logs. |
| 1009      | Incorrect Share Password          | Generally indicates a data format error; check console logs. |
| 10010     | Server Request Exception          | Generally due to request errors; contact technical support. |
| 10011     | Request Parameter Error           | Check console logs for details.                      |
| 10012     | Invalid Parameter                 | Generally due to request errors; check console logs. |
| 10013     | Invalid Parameter                 | Generally due to request errors; check console logs. |
| 10014     | Missing Request Parameter Field   | Check console logs for details.                      |
| 10015     | Upload Failed                     | Check console logs for details.                      |
| 10016     | Incorrect Area ID                 | Generally due to incorrect parameter type; check console logs. |
| 10017     | Incorrect Node D                  | Generally indicates the parameter was not found; check console logs. |
| 10018     | File Type Not Found               | Check console logs for details.                      |
| 10019     | Download Address Error            | Server returned an incorrect or unusable address; check console logs. |
| 10020     | Download Exception                | Check console logs for details.                      |
| 10021     | Incorrect File ID Verification    | Check console logs for details.                      |
| 10022     | Download Type Not Found           | Check console logs for details.                      |
| 10023     | Download Type Not Found           | Check console logs for details.                      |
| 10024     | Report  Exception                 | Check console logs for details.                      |
| 10025     | ASSET Type Not Found              | Check console logs for details.                      |
| 10026     | Share  Exception                    | Check console logs for details.                      |
| 99999      | Unknown Error                    |                                                       |

--- 

