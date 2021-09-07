import * as fs from "fs";
import { Request, Response, RequestHandler, NextFunction } from "express";
import { sha256 } from "js-sha256";
import cryptoRandomString = require("crypto-random-string");
import cron from "node-cron";
import tmp from "tmp";
import moment from "moment";
let crypto = require("crypto");
// import koi from 'koi_tools';
// TODO - fix wallet generation and signing using a seed phrase tmp wallet
import e = require("express");
// const { koi_tools } = require("koi_tools");
const tools = require("@_koi/sdk/web");
const koi = new tools.Web();
import { RawLogs, FormattedLogsArray } from "./types";
import { raw } from "express";
// import MockDate from 'mockdate';
// var date = "2021-06-29";
// var time = "23:57";
// MockDate.set(moment(date + ' ' + time).toDate());
const cronstring = "0 0 0 * * *";
// console.log("\n" + moment() + "\n");
// const cronstring = "0 */2 * * * *";

const version = "1.0.3";

class koiLogs {
  private async generateLogFiles(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // create three files (access.log, daily.log, and proofs.log) with names corresponding to the date
        // var date = new Date();
        // var names = [
        //   date.toISOString().slice(0, 10) + '-daily.log',
        //   date.toISOString().slice(0, 10) + '-access.log',
        //   date.toISOString().slice(0, 10) + '-proofs.log',
        // ]
        this.currentDate = moment();
        const currentDateStr = this.currentDate.format("Y-MM-DD");
        const dayBeforeCurrentDateStr = this.currentDate
          .subtract(1, "days")
          .format("Y-MM-DD");
        let names = [
          dayBeforeCurrentDateStr + "-daily.log",
          currentDateStr + "-access.log",
          currentDateStr + "-proofs.log",
          currentDateStr + "-daily.log",
        ];

        let paths: string[] = [];
        for (var name of names) {
          try {
            var path = (await this.createLogFile(name)) as string;
            paths.push(path);
          } catch (err) {
            reject(err);
          }
        }
        // console.log('created paths', paths, paths[0])

        // set the log file names in global vars
        // sloppy, needs to move to cleaner OOP
        this.logFileLocation = paths[0];

        this.rawLogFileLocation = paths[1];

        this.proofFileLocation = paths[2];
        this.currentLogFileDir = paths[3];

        // return their file names to the caller
        resolve(paths);
      } catch (err) {
        reject(err);
      }
    });
  }

  public logger: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!this.rawLogFileLocation) {
      await this.rawLogFileLocation;
    }
    var payload: any = {
      address: req.ip,
      date: new Date(),
      method: req.method,
      url: req.path,
      type: req.protocol,
      proof: {
        signature: req.headers["x-request-signature"],
        public_key: req.headers["request-public-key"],
        network: req.headers["Network-Type"],
      },
    };
    // console.log(this.rawLogFileLocation);
    if (payload.proof.signature) {
      let dataAndSignature = JSON.parse(payload.proof.signature);
      let valid = await koi.verifySignature({
        ...dataAndSignature,
        owner: payload.proof.public_key,
      });
      if (!valid) {
        console.log("Signature verification failed");
        return next();
      }
      let signatureHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(dataAndSignature.signature))
        .digest("hex");
      if (!this.difficultyFunction(signatureHash)) {
        console.log("Signature hash incorrect");
        return next();
      }
    }
    fs.appendFile(
      this.rawLogFileLocation,
      JSON.stringify(payload) + "\r\n",
      function (err) {
        if (err) throw err;
      }
    );
    return next();
  };

  difficultyFunction(hash: String) {
    return hash.startsWith("00") || hash.startsWith("01");
  }







  private async logsTask(deleteRaw: boolean = true): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        let masterSalt = getLogSalt();

        // then get the raw logs
        let rawLogs = (await this.readRawLogs(
          masterSalt,
          this.rawLogFileLocation
        )) as RawLogs[];
        console.log(`read rawLogs for -- ${this.rawLogFileLocation}`); //02

        let sorted = (await sortAndFilterLogs(rawLogs)) as FormattedLogsArray;
        console.log(`sorted rawLogs for -- ${this.rawLogFileLocation}`); //02
        let result: any;

        if (!deleteRaw) {
          result = await this.writeDailyLogs(sorted, this.currentLogFileDir);
          console.log(`wrote daily for -- ${this.logFileLocation}`);
        }

        // last, clear old logs
        if (deleteRaw) {
          // await this.clearRawLogs();
          console.log("\nLOGS Cleared\n");
          let result = await this.writeDailyLogs(
            sorted,
            this.currentLogFileDir
          );
          console.log(`wrote daily for -- ${this.currentLogFileDir}`);
          this.generateLogFiles();
        }

        resolve(result);
      } catch (err) {
        // console.error('error writing daily log file', err)
        reject(err);
      }
    });
  }

  /*
      @clearRawLogs
        removes the old access logs file
    */

  /*
      @readRawLogs
        retrieves the raw logs and reads them into a json array
    */
  private async readRawLogs(
    masterSalt: string,
    filelocation: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let fullLogs = fs.readFileSync(filelocation); //this.rawLogFileLocation
      let logs = fullLogs.toString().split("\n");
      // console.log('logs are', logs)
      var prettyLogs = [] as RawLogs[];
      for (var log of logs) {
        // console.log('log is', log)
        try {
          if (log && !(log === " ") && !(log === "")) {
            try {
              var logJSON = JSON.parse(log) as RawLogs;
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

  /*
      @writeDailyLogs
        generates the daily log file (/logs/)
    */
  private async writeDailyLogs(
    logs: FormattedLogsArray,
    filelocation: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // generate the log payload
      var data = {
        gateway: this.node_id,
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
        filelocation, //this.currentLogFileDir,
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

  /*
      generate the log files
    */
  private async createLogFile(name: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      // resolve('/tmp/' + name as string)
      if (this.fileDIR > "") {
        var fileName = this.fileDIR + name;
        try {
          if (!fs.existsSync(fileName)) {
            await writeEmptyFile(fileName);
          }
          resolve(fileName);
        } catch (err) {
          reject("function getLogSalt() {
            return sha256(cryptoRandomString({ length: 10 }));
          }error writing log file " + fileName);
        }
      } else {
        tmp.file(function _tempFileCreated(err, path: string, fd) {
          if (err) reject(err);
          // console.log('fd', fd)
          // console.log('File: ', path);
          resolve(path);
        });
      }
    });
  }
}

//////////////////////// Utility Functions //////////////////////////////
/*
    generates and returns a signature for a koi logs payload
  */
function signLogs(data: object) {
  // TODO - replace with koi.sign and ensure a seed phrase is saved by end user somehow
  return sha256(cryptoRandomString({ length: 10 })); // TODO
}

/*
    @sortAndFilterLogs
      logs - access.log output (raw data in array)
      resolves to an array of data payloads
  */
async function sortAndFilterLogs(logs: RawLogs[]) {
  return new Promise(async (resolve, reject) => {
    var formatted_logs = [] as FormattedLogsArray;

    try {
      for (var log of logs) {
        if (log.url && log.uniqueId) {
          if (!log.proof) log.proof = {} as any;
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

async function writeEmptyFile(location: string) {
  return new Promise((resolve, reject) => {
    fs.writeFile(location, "", {}, function (err) {
      if (err) {
        // console.log('ERROR CREATING ACCESS LOG at' + location, err)
        resolve({ success: false, error: err });
      } else {
        resolve({ success: true });
      }
    });
  });
}

function getLogSalt() {
  return sha256(cryptoRandomString({ length: 10 }));
}

export = koiLogs;
