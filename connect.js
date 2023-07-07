import { createPromiseClient } from "@bufbuild/connect";
import { Query } from "@buf/cosmos_cosmos-sdk.bufbuild_connect-es/cosmos/auth/v1beta1/query_connect.js";
import { createGrpcTransport, createGrpcWebTransport, Http2SessionManager } from "@bufbuild/connect-node";

// import { createConnectTransport } from "@bufbuild/connect-web";

const sessionManager = new Http2SessionManager("http://127.0.0.1:9090", { pingIdleConnection: false });
const transport = createGrpcTransport({
  baseUrl: "http://127.0.0.1:9090",
  httpVersion: "2",
  sessionManager,
});

async function main() {
  const client = createPromiseClient(Query, transport);
  // console.log(client.account);
  let res;
  res = await client.params({}, { timeoutMs: 1000 });
  console.log(res);
  // // process.exit(0);
  sessionManager.abort("xxxxxxxx");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
