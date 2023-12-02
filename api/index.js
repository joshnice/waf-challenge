exports.handler = async function (event, context) {
  const responseBody = { hello: "from waf-challenge" };
  return {
    statusCode: 200,
    body: JSON.stringify(responseBody),
  };
};
