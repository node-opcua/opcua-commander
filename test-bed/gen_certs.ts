import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import path from "path";
import fs from "fs";
import { makeApplicationUrn } from "node-opcua-client";
import os from "os";

async function main() {
    const pkiFolder = path.join(process.cwd(), "test-bed/pki");
    
    if (fs.existsSync(pkiFolder)) {
        fs.rmSync(pkiFolder, { recursive: true });
    }

    const certificateManager = new OPCUACertificateManager({
        rootFolder: pkiFolder,
        name: "test-pki"
    });

    await certificateManager.initialize();

    // 1. Create Server Certificate
    const serverCertFile = path.join(pkiFolder, "server_cert.pem");
    await certificateManager.createSelfSignedCertificate({
        applicationUri: makeApplicationUrn(os.hostname(), "TestServer"),
        outputFile: serverCertFile,
        subject: "/CN=TestServer/O=Test/L=Paris",
        startDate: new Date(),
        validity: 365,
        dns: []
    });
    console.log("Server certificate created:", serverCertFile);

    // 2. Create User Certificate
    const userCertFile = path.join(pkiFolder, "user_cert.pem");
    const userKeyFile = path.join(pkiFolder, "user_key.pem");
    
    await certificateManager.createSelfSignedCertificate({
        applicationUri: "urn:TestUser",
        outputFile: userCertFile,
        subject: "/CN=TestUser/O=Test/L=Paris",
        startDate: new Date(),
        validity: 365,
        dns: []
    });
    
    // The private key is automatically created in the 'own/private' folder by default or managed by the manager.
    // For simplicity in the test, we'll just copy it to a known location.
    const privateKeySource = certificateManager.privateKey;
    fs.copyFileSync(privateKeySource, userKeyFile);

    console.log("User certificate created:", userCertFile);
    console.log("User private key created:", userKeyFile);
}

main().catch(err => console.error(err));
