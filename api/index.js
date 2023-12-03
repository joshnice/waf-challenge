exports.handler = async function (event, context) {
  const responseBody = { hello: "from waf-challenge" };
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(responseBody),
  };
};
