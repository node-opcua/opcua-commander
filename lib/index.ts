/* eslint no-console: off , no-process-exit: off*/
import "./blessed-shim.js";
import { promisify } from "util";
import chalk from "chalk";
import { Model, makeUserIdentity } from "./model/model.js";
import { View } from "./view/view.js";
import { initLogger, setLogWindow } from "./logger.js";
import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { makeCertificate } from "./make_certificate.js";
import fs from "fs";
import path from "path";

const version = "0.40.0";

import check from "check-node-version";
import { program } from "./commander_setup.js";

async function check_nodejs() {
  try {
    const result: any = await promisify(check as any)({ node: ">=12" });
    if (result.isSatisfied) {
      return;
    }
    console.log(chalk.red("Your nodejs version is too old: " + result.versions.node.version));
    console.log(chalk.red("Please upgrade to nodejs >= 12"));
    process.exit(1);
  } catch (err) {
    //
  }
}


async function main() {
  initLogger();
  await check_nodejs();

  program.version(version);
  program.parse(process.argv);
  const argv = program.opts();

  const endpoint = program.args[0] || "opc.tcp://localhost:26543";

  const userIdentity = makeUserIdentity(argv);

  const model = new Model();
  model.showNamespace = !!argv.showNamespace;

  const options = {
    endpoint,
    securityMode: MessageSecurityMode[argv.securityMode as keyof typeof MessageSecurityMode] || MessageSecurityMode.None,
    securityPolicy: (SecurityPolicy as any)[argv.securityPolicy] || SecurityPolicy.None,
    certificateFile: argv.certificateFile,
    privateKeyFile: argv.privateKeyFile,
    userIdentity,
  };

  const { certificateFile, clientCertificateManager, applicationName, applicationUri } = await makeCertificate();

  try {
    await model.initialize(
      options.endpoint,
      options.securityMode,
      options.securityPolicy,
      options.certificateFile || certificateFile,
      clientCertificateManager,
      applicationName,
      applicationUri
    );
    await model.doConnect(options.endpoint, userIdentity);
    const view = new View(model);
    setLogWindow(view.logWindow);
    await view.run();
    await model.disconnect();
    console.log("Done");
    process.exit(0);
  } catch (err) {
    console.log(chalk.red("Error: " + (err as Error).message));
    process.exit(1);
  }
}

main();
