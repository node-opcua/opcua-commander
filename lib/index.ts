/* eslint no-console: off , no-process-exit: off*/
import "source-map-support/register.js";
import { promisify } from "util";
import chalk from "chalk";
import { Model, makeUserIdentity } from "./model/model.js";
import { View } from "./view/view.js";
import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { makeCertificate } from "./make_certificate.js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const packageJson = require("../package.json");
const version = packageJson.version;

import check from "check-node-version";

async function check_nodejs() {
  try {
    const result: any = await promisify(check as any)({ node: ">=12" });
    if (result.isSatisfied) {
      return;
    }
    console.error("Some package version(s) failed!");

    for (const packageName of Object.keys(result.versions)) {
      if (!result.versions[packageName].isSatisfied) {
        console.error(`Incorrect ${packageName} version. 
        your version            : ${result.versions[packageName].version.version}
        expected minimum version: ${result.versions[packageName].wanted.range}`);
        // ${JSON.stringify(result.versions[packageName],null, " ")}
      }
    }
    process.exit();
  } catch (err: any) {
    console.error(err);
    process.exit();
  }
}

// xx const updateNotifier = require("update-notifier");
const pkg = packageJson;

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = (yargs(hideBin(process.argv)) as any)
  .wrap(132)

  .demand("endpoint")
  .string("endpoint")
  .describe("endpoint", "the end point to connect to ")

  .string("securityMode")
  .describe("securityMode", "the security mode")

  .string("securityPolicy")
  .describe("securityPolicy", "the policy mode")

  .string("userName")
  .describe("userName", "specify the user name of a UserNameIdentityToken ")

  .string("password")
  .describe("password", "specify the password of a UserNameIdentityToken")

  .string("node")
  .describe("node", "the nodeId of the value to monitor")

  .string("history")
  .describe("history", "make an historical read")

  .string("userCertificate")
  .describe("userCertificate", "X509 user certificate (PEM format)")

  .string("userCertificatePrivateKey")
  .describe("userCertificatePrivateKey", "X509 private key associated with the user certificate")

  .boolean("verbose")
  .describe("verbose", "display extra information")

  .alias("e", "endpoint")
  .alias("s", "securityMode")
  .alias("P", "securityPolicy")
  .alias("u", "userName")
  .alias("p", "password")
  .alias("n", "node")
  .alias("t", "timeout")
  .alias("v", "verbose")
  .alias("c", "userCertificate")
  .alias("x", "userCertificatePrivateKey")

  .example("opcua-commander  --endpoint opc.tcp://localhost:49230 -P=Basic256 -s=Sign")
  .example("opcua-commander  -e opc.tcp://localhost:49230 -P=Basic256 -s=Sign -u JoeDoe -p P@338@rd ")
  .example('opcua-commander  --endpoint opc.tcp://localhost:49230  -n="ns=0;i=2258"').argv;

const securityMode: MessageSecurityMode = MessageSecurityMode[argv.securityMode || "None"] as any as MessageSecurityMode;
if (!securityMode) {
  throw new Error(
    `Invalid Security mode , was  ${chalk.magenta((argv as any).securityMode)}\nshould be  ${chalk.cyan(
      Object.values(MessageSecurityMode).filter((v) => typeof v === "string").join(",")
    )}`
  );
}

const securityPolicy = (SecurityPolicy as any)[(argv as any).securityPolicy || "None"];
if (!securityPolicy) {
  throw new Error(
    `Invalid securityPolicy\nwas       : ${chalk.magenta((argv as any).securityPolicy)}\nshould be : ${chalk.cyan(
      Object.keys(SecurityPolicy).filter((k) => typeof k === "string" && k !== "Invalid" && !k.match(/PubSub/))
    )}`
  );
}

const endpointUrl = (argv as any).endpoint || "opc.tcp://localhost:26543";
if (!endpointUrl) {
  (yargs as any).showHelp();
  // xx updateNotifier({ pkg }).notify();
  process.exit(0);
}

(async () => {
  await check_nodejs();

  const { certificateFile, clientCertificateManager, applicationUri, applicationName } = await makeCertificate();

  const model = new Model();
  const view = new View(model);
  await model.initialize(
    endpointUrl,
    securityMode,
    securityPolicy,
    certificateFile,
    clientCertificateManager,
    applicationName,
    applicationUri
  );

  const node_opcua_version = require("node-opcua-client/package.json").version;

  console.log(chalk.green(" Welcome to Node-OPCUA Commander ") + version);
  console.log(chalk.green("  node-opcua      = ") + node_opcua_version);
  console.log(chalk.cyan("   endpoint url    = "), endpointUrl.toString());
  console.log(chalk.cyan("   securityMode    = "), MessageSecurityMode[securityMode]);
  console.log(chalk.cyan("   securityPolicy  = "), securityPolicy.toString());
  console.log(chalk.cyan("   certificate file = "), certificateFile);
  console.log(chalk.cyan("   trusted certificate folder = "), clientCertificateManager.trustedFolder);
  const userIdentity = makeUserIdentity(argv);
  model.doConnect(endpointUrl, userIdentity);

  model.on("connectionError", (err) => {
    console.log(chalk.red("  exiting"));
    view.logWindow.focus();
    setTimeout(() => process.exit(-1), 10000);
  });
})();
