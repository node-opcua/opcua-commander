import { Command } from "commander";

export const program = new Command();

program
  .name("opcua-commander")
  .description("OPCUA TUI Client")
  .argument("[endpoint]", "the endpoint to connect to", "opc.tcp://localhost:26543")
  .option("-u, --userName <name>", "the user name for user name authentication")
  .option("-p, --password <password>", "the password for user name authentication")
  .option("-c, --userCertificate <path>", "the path to the user certificate file (PEM format)")
  .option("-k, --userCertificatePrivateKey <path>", "the path to the user certificate private key file (PEM format)")
  .option("-n, --certificateFile <path>", "the path to the client certificate file (PEM format)")
  .option("-v, --privateKeyFile <path>", "the path to the client private key file (PEM format)")
  .option("-s, --securityMode <mode>", "the security mode (None, Sign, SignAndEncrypt)", "None")
  .option("-y, --securityPolicy <policy>", "the security policy (Basic128Rsa15, Basic256, Basic256Sha256, Aes128_Sha256_RsaOaep, Aes256_Sha256_RsaPss)", "None")
  .option("--showNamespace", "show namespace index in the tree", false);
