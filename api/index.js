import http from "./http.js";
export default class API {
  constructor({ rpcHttp, rpcWebsocket, apiHttp }) {
    this.apiHttp = apiHttp;
    this.rpcHttp = rpcHttp;
    this.rpcWebsocket = rpcWebsocket;
  }
  async health() {
    return http.get(`${this.rpcHttp}/health`);
  }
  async status() {
    return http.get(`${this.rpcHttp}/status`);
  }
  async validators() {
    return http.get(`${this.rpcHttp}/validators`);
  }
  async netInfo() {
    return http.get(`${this.rpcHttp}/net_info`);
  }
  async unconfirmedTxs() {
    return http.get(`${this.rpcHttp}/num_unconfirmed_txs`);
  }
  async blockchain(minHeight, maxHeight) {
    if (minHeight == undefined || maxHeight == undefined) {
      return http.get(`${this.rpcHttp}/blockchain`);
    } else {
      return http.get(`${this.rpcHttp}/blockchain?minHeight=${minHeight}&maxHeight=${maxHeight}`);
    }
  }
  async txSearch(query, page, perPage, order = "desc") {
    return http.get(`${this.rpcHttp}/tx_search?query="${query}"&prove=false&page=${page}&per_page=${perPage}&order_by="${order}"`);
  }
  async blockSearch(query, page, perPage, order = "desc") {
    return http.get(`${this.rpcHttp}/block_search?query="${query}"&page=${page}&per_page=${perPage}&order_by="${order}"`);
  }
  async block(height) {
    if (height) {
      return http.get(`${this.rpcHttp}/block?height=${height}`);
    } else {
      return http.get(`${this.rpcHttp}/block`);
    }
  }
  async blockByHash(hash) {
    return http.get(`${this.rpcHttp}/block_by_hash?hash=${hash}`);
  }
  async txCommit(tx) {
    return http.get(`${this.rpcHttp}/broadcast_tx_commit`, { tx });
  }
  async genesis() {
    return http.get(`${this.rpcHttp}/genesis`);
  }
  async commit(height) {
    return http.get(`${this.rpcHttp}/commit?height=${height}`);
  }
  async blockResults(height) {
    return http.get(`${this.rpcHttp}/block_results?height=${height}`);
  }
  async lastHeight() {
    const rsp = await http.get(`${this.rpcHttp}/abci_info`);
    if (rsp.response.last_block_height) {
      return parseInt(rsp.response.last_block_height);
    } else {
      return 0;
    }
  }
  async evmosValidators() {
    return http.get(`${this.apiHttp}/cosmos/staking/v1beta1/validators`);
  }
  async validator(validatorAddr) {
    return http.get(`${this.apiHttp}/cosmos/staking/v1beta1/validators/${validatorAddr}`);
  }
  async authAccount(address) {
    return http.get(`${this.apiHttp}/cosmos/auth/v1beta1/accounts/${address}`);
  }
  async bankBalance(address, denom) {
    return http.get(`${this.apiHttp}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${denom}`);
  }
  async allBalance(address) {
    return http.get(`${this.apiHttp}/cosmos/bank/v1beta1/balances/${address}`);
  }
  async accounts(offset, limit) {
    if (offset == undefined || limit == undefined) {
      return http.get(`${this.apiHttp}/cosmos/auth/v1beta1/accounts`);
    } else {
      return http.get(`${this.apiHttp}/cosmos/auth/v1beta1/accounts?pagination.offset=${offset}&pagination.limit=${limit}&pagination.count_total=true`);
    }
  }
  async proposals(offset, limit) {
    if (offset == undefined || limit == undefined) {
      return http.get(`${this.apiHttp}/cosmos/gov/v1beta1/proposals`);
    } else {
      return http.get(`${this.apiHttp}/cosmos/gov/v1beta1/proposals?pagination.offset=${offset}&pagination.limit=${limit}&pagination.count_total=true`);
    }
  }
  async getBlockWithTxs(height, offset, limit) {
    return http.get(`${this.apiHttp}/cosmos/tx/v1beta1/txs/block/${height}?pagination.offset=${offset}&pagination.limit=${limit}&pagination.count_total=true`);
  }
  async getTx(hash) {
    return http.get(`${this.apiHttp}/cosmos/tx/v1beta1/txs/${hash}`);
  }
  async delegations(delegator, offset = 0, limit = 1000, reverse = false) {
    return http.get(`${this.apiHttp}/cosmos/staking/v1beta1/delegations/${delegator}?pagination.offset=${offset}&pagination.limit=${limit}&pagination.reverse=${reverse}`);
  }
  async validatorDelegations(delegator, offset = 0, limit = 1000, reverse = false) {
    return http.get(`${this.apiHttp}/cosmos/staking/v1beta1/validators/${delegator}/delegations?pagination.offset=${offset}&pagination.limit=${limit}&pagination.reverse=${reverse}`);
  }
  async rewards(delegator) {
    return http.get(`${this.apiHttp}/cosmos/distribution/v1beta1/delegators/${delegator}/rewards`);
  }
  async commissionRewards(validator) {
    return http.get(`${this.apiHttp}/cosmos/distribution/v1beta1/validators/${validator}/commission`);
  }
  async outstandingRewards(validator) {
    return http.get(`${this.apiHttp}/cosmos/distribution/v1beta1/validators/${validator}/outstanding_rewards`);
  }
  async circulatingSupply() {
    return http.get(`${this.apiHttp}/evmos/inflation/v1/circulating_supply`);
  }
  async epochMintProvision() {
    return http.get(`${this.apiHttp}/evmos/inflation/v1/epoch_mint_provision`);
  }
  async inflationRate() {
    return http.get(`${this.apiHttp}/evmos/inflation/v1/inflation_rate`);
  }
  async inflationParams() {
    return http.get(`${this.apiHttp}/evmos/inflation/v1/params`);
  }
  async inflationPeriod() {
    return http.get(`${this.apiHttp}/evmos/inflation/v1/period`);
  }
  async inflationSkippedEpochs() {
    return http.get(`${this.apiHttp}/evmos/inflation/v1/skipped_epochs`);
  }
  async stakingParams() {
    return http.get(`${this.apiHttp}/cosmos/staking/v1beta1/params`);
  }
  async govParams() {
    let params = {};
    const deposit = await http.get(`${this.apiHttp}/cosmos/gov/v1beta1/params/deposit`);
    params.deposit_params = deposit.deposit_params;
    const voting = await http.get(`${this.apiHttp}/cosmos/gov/v1beta1/params/voting`);
    params.voting_params = voting.voting_params;
    const tallying = await http.get(`${this.apiHttp}/cosmos/gov/v1beta1/params/tallying`);
    params.tallying = tallying.tally_params;
    return params;
  }
  async distributionParams() {
    return http.get(`${this.apiHttp}/cosmos/distribution/v1beta1/params`);
  }
  async slashingParams() {
    return http.get(`${this.apiHttp}/cosmos/slashing/v1beta1/params`);
  }
  async stakingPool() {
    return http.get(`${this.apiHttp}/cosmos/staking/v1beta1/pool`);
  }
  async communityPool() {
    return http.get(`${this.apiHttp}/cosmos/distribution/v1beta1/community_pool`);
  }
  async bankSupply() {
    return http.get(`${this.apiHttp}/cosmos/bank/v1beta1/supply`);
  }
  async epochs() {
    return http.get(`${this.apiHttp}/evmos/epochs/v1/epochs`);
  }
  async feemarktParams() {
    return http.get(`${this.apiHttp}/ethermint/feemarket/v1/params`);
  }
  async mintAnnualProvisions() {
    return http.get(`${this.apiHttp}/cosmos/mint/v1beta1/annual_provisions`);
  }
  async mintInflation() {
    return http.get(`${this.apiHttp}/cosmos/mint/v1beta1/inflation`);
  }
  async mintParams() {
    return http.get(`${this.apiHttp}/cosmos/mint/v1beta1/params`);
  }
}
