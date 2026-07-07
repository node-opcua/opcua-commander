const { 
    OPCUAServer, 
    Variant, 
    DataType, 
    StatusCodes, 
} = require("node-opcua");
const { readCertificate } = require("node-opcua-crypto");
const path = require("path");
const fs = require("fs");

async function main() {
    const pkiFolder = path.join(process.cwd(), "test-bed/pki");
    const serverCertFile = path.join(pkiFolder, "server_cert.pem");
    const userCertFile = path.join(pkiFolder, "user_cert.pem");
    const expectedCertDER = readCertificate(userCertFile);

    const server = new OPCUAServer({
        port: 4334,
        certificateFile: serverCertFile,
        privateKeyFile: path.join(pkiFolder, "own/private/private_key.pem"),
        userManager: {
            isValidUser: (session, username, password) => {
                return false;
            },
            getUserRoles: (username) => {
                return [];
            },
            isValidUserCertificate: (certificate) => {
                console.log("Received user certificate: length=", certificate.length);
                console.log("Expected user certificate: length=", expectedCertDER.length);
                // In a real scenario, we'd verify the certificate chain.
                // For this test, we just check if it's the one we expect.
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

    // Trust the user certificate
    await server.serverCertificateManager.trustCertificate(expectedCertDER);

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
        value: {
            get: () => new Variant({ dataType: DataType.Double, value: Math.random() })
        }
    });

    await server.start();
    console.log("Server is now listening on port ", server.endpoints[0].port);
    console.log("Server endpoint URL: ", server.endpoints[0].endpointDescriptions()[0].endpointUrl);
}

main().catch(err => console.error(err));
