const { 
    OPCUAServer, 
    Variant, 
    DataType, 
    StatusCodes, 
    makeApplicationUrn,
} = require("node-opcua");
const { readCertificate } = require("node-opcua-crypto");
const { OPCUACertificateManager } = require("node-opcua-certificate-manager");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

async function main() {
    const pkiFolder = path.join(process.cwd(), "test-bed/pki");
    
    if (!fs.existsSync(pkiFolder)) {
        fs.mkdirSync(pkiFolder, { recursive: true });
    }

    const certificateManager = new OPCUACertificateManager({
        rootFolder: pkiFolder
    });
    await certificateManager.initialize();

    const serverCertFile = path.join(pkiFolder, "server_cert.pem");
    const serverKeyFile = path.join(pkiFolder, "own/private/private_key.pem");

    const applicationName = "TestServer";
    const applicationUri = makeApplicationUrn(os.hostname(), applicationName);

    if (!fs.existsSync(serverCertFile)) {
        console.log("Generating new server certificate...");
        await certificateManager.createSelfSignedCertificate({
            applicationUri,
            outputFile: serverCertFile,
            subject: `/CN=${applicationName}/O=Sterfive/L=Paris`,
            dns: [os.hostname(), "localhost"],
            startDate: new Date(),
            validity: 365 * 10,
        });
    }

    const userCertFile = path.join(pkiFolder, "user_cert.pem");
    let expectedCertDER = null;
    if (fs.existsSync(userCertFile)) {
        expectedCertDER = readCertificate(userCertFile);
    }

    const server = new OPCUAServer({
        port: 4334,
        applicationUri,
        serverInfo: {
            applicationUri, 
            applicationName: { text: applicationName },
            productUri: "urn:Sterfive:TestServer",  
        },
        certificateFile: serverCertFile,
        privateKeyFile: serverKeyFile,
        serverCertificateManager: certificateManager,
        
        userManager: {
            isValidUser: (_session, _username, _password) => {
                return false;
            },
            getUserRoles: (_username) => {
                return [];
            },
            isValidUserCertificate: (certificate) => {
                if (!expectedCertDER) {
                    console.log("No expected user certificate found to compare.");
                    return StatusCodes.BadUserAccessDenied;
                }
                console.log("Received user certificate: length=", certificate.length);
                console.log("Expected user certificate: length=", expectedCertDER.length);
                if (certificate.equals(expectedCertDER)) {
                    console.log("X509 User authenticated successfully!");
                    return StatusCodes.Good;
                }
                console.log("X509 User authentication failed!");
                return StatusCodes.BadUserAccessDenied;
            }
        }
    });
    
    await server.initialize();

    if (expectedCertDER) {
        // Trust the user certificate
        await server.serverCertificateManager.trustCertificate(expectedCertDER);
    }

    const addressSpace = server.engine.addressSpace;
    const namespace = addressSpace.getOwnNamespace();

    const device = namespace.addObject({
        organizedBy: addressSpace.rootFolder.objects,
        browseName: "MyDevice"
    });

    namespace.addVariable({
        componentOf: device,
        browseName: "MyVariable",
        dataType: "Double",
        minimumSamplingInterval: 1000,
        value: {
            get: () => new Variant({ dataType: DataType.Double, value: Math.random() })
        }
    });

    await server.start();
    console.log("Server is now listening on port ", server.endpoints[0].port);
    console.log("Server endpoint URL: ", server.endpoints[0].endpointDescriptions()[0].endpointUrl);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
