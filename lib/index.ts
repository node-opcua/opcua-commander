/* eslint no-console: off , no-process-exit: off*/
import { promisify } from "util";
import chalk from "chalk";
import { Model, makeUserIdentity } from "./model/model.js";
import { View } from "./view/view.js";
import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { makeCertificate } from "./make_certificate.js";
import fs from "fs";
import path from "path";


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

import { program } from "commander";

program
  .version(version)
  .option("-e, --endpoint <url>", "the end point to connect to", "opc.tcp://localhost:26543")
  .option("-s, --securityMode <mode>", "the security mode (None, Sign, SignAndEncrypt)", "None")
  .option("-P, --securityPolicy <policy>", "the policy mode (None, Basic128Rsa15, Basic256, etc.)", "None")
  .option("-u, --userName <name>", "specify the user name of a UserNameIdentityToken")
  .option("-p, --password <password>", "specify the password of a UserNameIdentityToken")
  .option("-n, --node <nodeId>", "the nodeId of the value to monitor")
  .option("-h, --history <nodeId>", "make an historical read")
  .option("-c, --userCertificate <path>", "X509 user certificate (PEM format)")
  .option("-x, --userCertificatePrivateKey <path>", "X509 private key associated with the user certificate")
  .option("-v, --verbose", "display extra information")
  .addHelpText("after", `
Examples:
  opcua-commander --endpoint opc.tcp://localhost:49230 -P=Basic256 -s=Sign
  opcua-commander -e opc.tcp://localhost:49230 -P=Basic256 -s=Sign -u JoeDoe -p P@338@rd 
  opcua-commander --endpoint opc.tcp://localhost:49230 -n="ns=0;i=2258"
`);

program.parse(process.argv);

const options = program.opts();

const securityMode: MessageSecurityMode = MessageSecurityMode[options.securityMode || "None"] as any as MessageSecurityMode;
if (securityMode === undefined) {
  throw new Error(
    `Invalid Security mode , was  ${chalk.magenta(options.securityMode)}\nshould be  ${chalk.cyan(
      Object.values(MessageSecurityMode).filter((v) => typeof v === "string").join(",")
    )}`
  );
}

const securityPolicy = (SecurityPolicy as any)[options.securityPolicy || "None"];
if (!securityPolicy) {
  throw new Error(
    `Invalid securityPolicy\nwas       : ${chalk.magenta(options.securityPolicy)}\nshould be : ${chalk.cyan(
      Object.keys(SecurityPolicy).filter((k) => typeof k === "string" && k !== "Invalid" && !k.match(/PubSub/))
    )}`
  );
}

const endpointUrl = options.endpoint;
const argv = options;
if (!endpointUrl) {
  program.help();
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
