const chronos = require('@chronosmicro/tracker');
require('./chronos-config');
const protoLoader = require('@grpc/proto-loader');
const grpc = require('@grpc/grpc-js');

const PROTO_PATH = './order.proto';
const client = require('./bookClient.js');
const OrderModel = require('./orderModel.js');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  arrays: true.valueOf,
});
chronos.track();
const orderProto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();
// Wrap the server here
const ServerWrapper = chronos.ServerWrapper(server, orderProto.ProxyToOrder.service, {
  AddOrder: (call, callback) => {
    const newOrder = {
      customerID: call.request.customerID,
      bookID: call.request.bookID,
      purchaseDate: call.request.purchaseDate,
      deliveryDate: call.request.deliveryDate,
    };
    client.GetBookInfo({ bookID: newOrder.bookID }, (err, bookInfo) => {
      // make sure bookID exists
      if (bookInfo === undefined) {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'BookID not found',
        });
      } else {
        OrderModel.create(newOrder)
          .then(data => {
            callback(null, {});
          })
          .catch(error => console.log(error));
      }
    });
  },

  GetOrders: (call, callback) => {
    const ordersWithInfo = [];
    // check call.metadata
    // expect metadata send to book client
    console.log(call.metadata);
    OrderModel.find({})
      .then(data => {
        // if no orders in database
        if (!data.length) return callback(null, { orderList: [] });
        // iterate through orders to get book info for each order
        for (let i = 0; i < data.length; i += 1) {
          const tempObj = {
            customerID: data[i].customerID,
            bookID: data[i].bookID,
            purchaseDate: data[i].purchaseDate,
            deliveryDate: data[i].deliveryDate,
          };
          // we must use tempObj because if you just use data[i], added properties do not appear when you console log data[i]. but the client stub still receives the added properties somehow
          client.GetBookInfo({ bookID: tempObj.bookID }, (err, bookInfo) => {
            // console.log('before adding', tempObj);
            tempObj.title = bookInfo.title;
            tempObj.author = bookInfo.author;
            tempObj.bookID = bookInfo.bookID;
            tempObj.numberOfPages = bookInfo.numberOfPages;
            tempObj.publisher = bookInfo.publisher;
            // console.log('after adding', tempObj);
            ordersWithInfo.push(tempObj);
            // console.log('ordersWithInfo', ordersWithInfo);

            // return gRPC call when ordersWithInfo is completely built up
            if (ordersWithInfo.length === data.length) {
              callback(null, { orderList: ordersWithInfo });
            }
          });
        }
      })
      .catch(err => console.log(err));
  },
});

console.log('ServerWrapper: ', ServerWrapper);
chronos.link(client, ServerWrapper);

// start server
server.bindAsync('127.0.0.1:30043', grpc.ServerCredentials.createInsecure(), () => {
  server.start();
});
console.log('Server running at http://127.0.0.1:30043');
