/* eslint no-console: off , no-process-exit: off*/
import * as  _ from "underscore";
import chalk from "chalk";
import { Model, makeUserIdentity } from "./model/model";
import { View } from "./view/view";
import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";

const truncate = require("cli-truncate");
const updateNotifier = require("update-notifier");
const pkg = require('../package.json');


const argv = require("yargs")
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
    .example("opcua-commander  --endpoint opc.tcp://localhost:49230  -n=\"ns=0;i=2258\"")

    .argv;


const securityMode: MessageSecurityMode = MessageSecurityMode[argv.securityMode || "None"] as any as MessageSecurityMode;
if (!securityMode) {
    throw new Error("Invalid Security mode , should be " + MessageSecurityMode);
}

const securityPolicy = (SecurityPolicy as any)[argv.securityPolicy || "None"];
if (!securityPolicy) {
    throw new Error("Invalid securityPolicy , should be " + SecurityPolicy);
}


const endpointUrl = argv.endpoint || "opc.tcp://localhost:26543";
const yargs = require("yargs");
if (!endpointUrl) {
    yargs.showHelp();
    updateNotifier({ pkg }).notify();
    process.exit(0);
}


const model = new Model();
const view = new View(model);

(async () => {
    await model.initialize(endpointUrl, securityMode, securityPolicy);

})();


const version = require("../package.json").version;
console.log(chalk.green(" Welcome to Node-OPCUA Commander ") + version);
console.log(chalk.cyan("   endpoint url   = "), endpointUrl.toString());
console.log(chalk.cyan("   securityMode   = "), securityMode.toString());
console.log(chalk.cyan("   securityPolicy = "), securityPolicy.toString());

(() => {
    const userIdentity = makeUserIdentity(argv);
    model.doDonnect(endpointUrl, userIdentity);
})();

