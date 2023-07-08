import { createPromiseClient } from "@bufbuild/connect";
import { Query } from "@buf/cosmos_cosmos-sdk.bufbuild_connect-es/cosmos/auth/v1beta1/query_connect.js";
import { createGrpcTransport, createGrpcWebTransport, Http2SessionManager } from "@bufbuild/connect-node";
// import { createConnectTransport } from "@bufbuild/connect-web";

const transport = createGrpcTransport({
  baseUrl: "http://127.0.0.1:9090",
  httpVersion: "2",
  idleConnectionTimeoutMs: 10,
});

async function main() {
  const client = createPromiseClient(Query, transport);
  const res = await client.params({});
  console.log(res.params);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
