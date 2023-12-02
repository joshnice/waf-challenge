import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Duration, aws_s3 as s3 } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_apigateway as apiGateway } from "aws-cdk-lib";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";
import { Distribution, OriginAccessIdentity } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { createName } from "./helpers";

/**
 * Basic set up of:
 * Frontend in s3 bucket and distributed using cloudfront
 * Api with ApiGateway and Lambda
 * WAF protecting our API from frontend requests which are not challenged
 */
export class WafChallenge extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* FRONTEND */

    // Create a bucket to store out frontend code
    const bucket = new s3.Bucket(this, createName("front-end"), {
      accessControl: s3.BucketAccessControl.PRIVATE,
    });

    // Create a bucket deployment
    // Gets the local frontend code and adds it our s3 bucket
    new BucketDeployment(this, createName("front-end-deployment"), {
      destinationBucket: bucket,
      sources: [Source.asset(path.resolve(__dirname, "../../client/dist"))],
    });

    // Create a OriginAccessIdentity
    // Allows cloudfront to get our frontend code in s3
    const originAccessIdentity = new OriginAccessIdentity(
      this,
      createName("origin-access-front-end-bucket")
    );
    // Add OriginAccessIdentity
    bucket.grantRead(originAccessIdentity);

    // Create cloudfront distribution to deliver our frontend code to the user
    new Distribution(this, createName("front-end-distribution"), {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new S3Origin(bucket, { originAccessIdentity }),
      },
    });

    /* API */

    // Create a lambda function
    // Acts as our API
    const lambdaFunction = new lambda.Function(this, createName("lambda"), {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../api")),
      timeout: Duration.seconds(10),
    });

    // Crete api gateway
    // Directs a request to our lambda function
    const api = new apiGateway.LambdaRestApi(this, createName("api-gateway"), {
      handler: lambdaFunction,
      // Proxy makes sure all requests go to the same lambda function
      proxy: true,
      // Allows requests from different domains (otherwise we would get CORs errors)
      defaultCorsPreflightOptions: {
        allowOrigins: apiGateway.Cors.ALL_ORIGINS,
      },
      // Automatically deploy it
      deploy: true,
      deployOptions: {
        stageName: "dev",
      },
    });
  }
}
