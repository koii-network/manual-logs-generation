const   fs =  require("fs") ;
const { sha256 } =require("js-sha256");
let rawLogFileLocation = "2021-09-06-access.log"
const readline = require("readline");

function logsTask(deleteRaw = false) {
  return new Promise(async (resolve, reject) => {
    try {
      let masterSalt = getLogSalt();

      // then get the raw logs
      let rawLogs = (await readRawLogs(
        masterSalt,
        rawLogFileLocation
      )) 
    //   console.log(`read rawLogs for -- ${this.rawLogFileLocation}`); //02

      let sorted = (await sortAndFilterLogs(rawLogs));
      // console.log(`sorted rawLogs for -- ${this.rawLogFileLocation}`); //02
      let result

      if (!deleteRaw) {
        result = await writeDailyLogs(sorted, this.currentLogFileDir);
        // console.log(`wrote daily for -- ${this.logFileLocation}`);
      }

      // last, clear old logs
      if (deleteRaw) {
        // await this.clearRawLogs();
        console.log("\nLOGS Cleared\n");
        let result = await writeDailyLogs(sorted, "2021-09-06-daily.log");
        // console.log(`wrote daily for -- ${this.currentLogFileDir}`);
        // this.generateLogFiles();
      }

      resolve(result);
    } catch (err) {
      // console.error('error writing daily log file', err)
      reject(err);
    }
  });
}

async function readRawLogs(masterSalt,fileLocation) {
  const fileStream = fs.createReadStream(fileLocation);
  const lineStream = readline.createInterface({input: fileStream, crlfDelay: Infinity});
  const prettyLogs = [];
  for await (const line of lineStream) {
    try {
      if (line.length < 2) continue
      const log = JSON.parse(line);
      log.uniqueId = sha256(log.url);
      log.address = sha256.hmac(masterSalt, log.address);
      prettyLogs.push(log);
    } catch {}
  }
  return prettyLogs;
}

/*
  return new Promise((resolve, reject) => {
    let fullLogs = fs.readFileSync(fileLocation); //this.rawLogFileLocation


    let logs = fullLogs.toString().split("\n");
    // console.log('logs are', logs)
    var prettyLogs = [];
    for (var log of logs) {
      // console.log('log is', log)
      try {
        if (log && !(log === " ") && !(log === "")) {
          try {
            var logJSON = JSON.parse(log);
            // console.log('logJSON is', logJSON)
            logJSON.uniqueId = sha256(logJSON.url);
            logJSON.address = sha256.hmac(masterSalt, logJSON.address);
            prettyLogs.push(logJSON);
          } catch (err) {
            // console.error('error reading json in Koi log middleware', err)
            // reject(err)
          }
        }
      } catch (err) {
        // console.error('err', err)
        // reject(err)
      }
    }
    // console.log('resolving some prettyLogs ('+ prettyLogs.length +') sample:', prettyLogs[prettyLogs.length - 1])
    resolve(prettyLogs);
  });
}

  */
function getLogSalt() {
  return sha256("YMiMbDaKl6I");
}
function signLogs(ff){
  return sha256("YMiMbDaKo6I");}
async function sortAndFilterLogs(logs) {
    return new Promise(async (resolve, reject) => {
      var formatted_logs = [];
  
      try {
        for (var log of logs) {
          if (log.url && log.uniqueId) {
            if (!log.proof) log.proof = {} 
            if (!formatted_logs[log.uniqueId]) {
              formatted_logs[log.uniqueId] = {
                addresses: [log.address],
                url: log.url,
                proofs: [log.proof],
              };
            } else {
              if (!formatted_logs[log.uniqueId].addresses.includes(log.address)) {
                formatted_logs[log.uniqueId].addresses.push(log.address);
                formatted_logs[log.uniqueId].proofs.push(log.proof);
              }
            }
          }
        }
        // console.log('about to resolve formattedlogs', formatted_logs.length, 'sample:', formatted_logs[formatted_logs.length - 1])
        resolve(formatted_logs);
      } catch (err) {
        reject(err);
      }
    });
  }

const version = "1.0.3";
 async function  writeDailyLogs(
  logs,
  filelocation
) {
  return new Promise((resolve, reject) => {
    // generate the log payload
    var data = {
      gateway: sha256("gefywebvhj56jby45"),
      lastUpdate: new Date(),
      summary: new Array(),
      signature: "",
      version: version,
    };
    // sign it
    data.signature = signLogs(data);
    for (var key in logs) {
      var log = logs[key];
      if (log && log.addresses) {
        data.summary.push(log);
      }
    }
    fs.writeFile(
      "2021-09-06-daily.log", //this.currentLogFileDir,
      JSON.stringify(data),
      {},
      function (err) {
        if (err) {
          // console.log('ERROR SAVING ACCESS LOG', err)
          resolve({ success: false, logs: data, error: err });
        } else {
          resolve({ success: true, logs: data });
        }
      }
    );
  });
}
logsTask()