const { 
    OPCUAClient, 
    UserTokenType,
} = require("node-opcua-client");
const { readCertificate } = require("node-opcua-crypto");
const path = require("path");
const fs = require("fs");

async function main() {
    const pkiFolder = path.join(process.cwd(), "test-bed/pki");
    const userCertFile = path.join(pkiFolder, "user_cert.pem");
    const userKeyFile = path.join(pkiFolder, "user_key.pem");

    const client = OPCUAClient.create({
        endpointMustExist: false,
        connectionStrategy: {
            maxRetry: 1
        }
    });

    try {
        console.log("Connecting to opc.tcp://localhost:4334 ...");
        await client.connect("opc.tcp://localhost:4334");
        
        console.log("Creating session with X509 user certificate ...");
        const session = await client.createSession({
            type: UserTokenType.Certificate,
            certificateData: readCertificate(userCertFile),
            privateKey: fs.readFileSync(userKeyFile, "utf-8"),
        });

        console.log("SUCCESS: Connected and session created with X509 user certificate!");
        await session.close();
        await client.disconnect();
    } catch (err) {
        console.error("FAILURE: Could not connect or authenticate with X509 user certificate:");
        console.error(err.message);
        process.exit(1);
    }
}

main().catch(err => console.error(err));
