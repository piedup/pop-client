const hfc = require('fabric-client');
const path = require('path');
const util = require('util');

function create() {
  const options = {
    wallet_path: path.join(__dirname, './creds'),
    user_id: 'PeerAdmin',
    channel_id: 'mychannel',
    chaincode_id: 'pop',
    peer_url: 'grpc://localhost:7051',
    event_url: 'grpc://localhost:7053',
    orderer_url: 'grpc://localhost:7050'
  };

  let channel = {};
  let client = null;
  const targets = [];
  let peer = null;

  function setupClient() {
    return Promise.resolve().then(() => {
      client = new hfc();
      return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
    }).then((wallet) => {
      client.setStateStore(wallet);
      return client.getUserContext(options.user_id, true);
    }).then((user) => {
      if (user === undefined || user.isEnrolled() === false) {
        console.error('User not defined, or not enrolled - error');
      }
      channel = client.newChannel(options.channel_id);
      peer = client.newPeer(options.peer_url);
      channel.addPeer(peer);
      channel.addOrderer(client.newOrderer(options.orderer_url));
      targets.push(peer);
    });
  }

  const Init = setupClient();

  function makeQuery(fcn, args) {
    return Init.then(() => {
      const txId = client.newTransactionID();
      const request = {
        chaincodeId: options.chaincode_id,
        txId,
        fcn,
        args,
      };
      return channel.queryByChaincode(request);
    }).then((queryResponses) => {
      console.log('returned from query');
      if (!queryResponses.length) {
        console.log('No payloads were returned from query');
      } else {
        console.log('Query result count = ', queryResponses.length);
      }
      if (queryResponses[0] instanceof Error) {
        console.error('error from query = ', queryResponses[0]);
      }
      return queryResponses[0];
    }).catch((err) => {
      console.error('Caught Error', err);
    });
  }

  function invoke(fcn, args) {
    let txId;

    return Init.then(() => {
      txId = client.newTransactionID();
      console.log('Assigning transaction_id: ', txId.getTransactionID());

      const request = {
        targets,
        chaincodeId: options.chaincode_id,
        fcn,
        args,
        chainId: options.channel_id,
        txId,
      };
      return channel.sendTransactionProposal(request);
    }).then((results) => {
      const proposalResponses = results[0];
      const proposal = results[1];
      const header = results[2];
      const transactionID = txId.getTransactionID();
      const eventPromises = [];

      let isProposalGood = false;

      if (proposalResponses && proposalResponses[0].response &&
      proposalResponses[0].response.status === 200) {
        isProposalGood = true;
        console.log('transaction proposal was good');
      } else {
        console.error('transaction proposal was bad');
      }
      if (isProposalGood) {
        console.log(util.format(
          'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
          proposalResponses[0].response.status,
          proposalResponses[0].response.message,
          proposalResponses[0].response.payload,
          proposalResponses[0].endorsement.signature
        ));

        const request = {
          proposalResponses,
          proposal,
          header,
        };
        // set the transaction listener and set a timeout of 30sec
        // if the transaction did not get committed within the timeout period,
        // fail the test
        // var transactionID = txId.getTransactionID();
        // var eventPromises = [];
        const eh = client.newEventHub();
        eh.setPeerAddr(options.event_url);
        eh.connect();

        const txPromise = new Promise((resolve, reject) => {
          const handle = setTimeout(() => {
            eh.disconnect();
            reject();
          }, 30000);

          eh.registerTxEvent(transactionID, (tx, code) => {
            clearTimeout(handle);
            eh.unregisterTxEvent(transactionID);
            eh.disconnect();
            if (code !== 'VALID') {
              console.error('The transaction was invalid, code = %s', code);
              reject();
            } else {
              console.log('The transaction has been committed on peer %s', eh.getPeerAddr());
              resolve();
            }
          });
        });
        eventPromises.push(txPromise);
        const sendPromise = channel.sendTransaction(request);

        return Promise.all([sendPromise].concat(eventPromises)).then((res) => {
          console.log('event promise all complete and testing complete');
          /* the first returned value is from the 'sendPromise' 
             which is from the 'sendTransaction()' call */
          return res[0];
        }).catch((err) => {
          console.error('Failed to send transaction and get notifications within the timeout period.');
          return `Failed to send transaction and get notifications within the timeout period. ${err}`;
        });
      }

      console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
      return 'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...';
    }, (err) => {
      console.error('Failed to send proposal due to error: %s', err.stack ? err.stack : err);
      return `Failed to send proposal due to error: ${err.stack ? err.stack : err}`;
    }).then((response) => {
      if (response.status === 'SUCCESS') {
        console.log('Successfully sent transaction to the orderer.');
        return txId.getTransactionID();
      }

      console.error('Failed to order the transaction. Error code: %s', response.status);
      return `Failed to order the transaction. Error code: ${response.status}`;
    }, (err) => {
      console.error('Failed to send transaction due to error: %s', err.stack ? err.stack : err);
      return `Failed to send transaction due to error: ${err.stack ? err.stack : err}`;
    });
  }

  function saveSegment(segment) {
    return invoke('SaveSegment', [segment]);
  }
  function getSegment(linkHash) {
    return makeQuery('GetSegment', [linkHash]);
  }
  function findSegments(queryString) {
    return makeQuery('FindSegments', [queryString]);
  }
  function getMapIds(queryString) {
    return makeQuery('GetMapIDs', [queryString]);
  }

  return {
    saveSegment,
    getSegment,
    findSegments,
    getMapIds,
  };
}

module.exports = create;