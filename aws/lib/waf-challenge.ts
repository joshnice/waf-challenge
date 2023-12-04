import { Construct } from "constructs";
import {
  Duration,
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_apigateway as apiGateway,
  Stack,
  StackProps,
  aws_wafv2 as WAF,
  Fn,
} from "aws-cdk-lib";
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
export class WafChallenge extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
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
    const cloudFront = new Distribution(
      this,
      createName("front-end-distribution"),
      {
        defaultRootObject: "index.html",
        defaultBehavior: {
          origin: new S3Origin(bucket, { originAccessIdentity }),
        },
      }
    );

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
        allowHeaders: ["X-Aws-Waf-Token"],
      },
      // Automatically deploy it
      deploy: true,
      deployOptions: {
        stageName: "dev",
      },
    });

    /* WAF */

    // Waf rules
    const wafRules: WAF.CfnWebACL.RuleProperty[] = [
      {
        // Need the BotControlRuleSet for when wanting to use challenge
        // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-bot.html
        name: "AWSManagedRulesBotControlRuleSet",
        priority: 1,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesBotControlRuleSet",
            // What requests we want to check
            // With this setup we are checking every request
            scopeDownStatement: {
              andStatement: {
                statements: [
                  {
                    byteMatchStatement: {
                      // If the url path contains "dev"
                      fieldToMatch: { uriPath: {} },
                      positionalConstraint: "CONTAINS",
                      searchString: "dev",
                      textTransformations: [
                        {
                          priority: 0,
                          type: "LOWERCASE",
                        },
                      ],
                    },
                  },
                  {
                    // And is not an OPTIONS request
                    notStatement: {
                      statement: {
                        byteMatchStatement: {
                          fieldToMatch: {
                            method: {},
                          },
                          positionalConstraint: "EXACTLY",
                          searchString: "OPTIONS",
                          textTransformations: [
                            {
                              type: "NONE",
                              priority: 0,
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
            managedRuleGroupConfigs: [
              {
                awsManagedRulesBotControlRuleSet: {
                  // Also need to set inspection level to "TARGETED" to use challenge
                  inspectionLevel: "TARGETED",
                },
              },
            ],
            // Recommended overrides, if these rules are met then challenge the request
            ruleActionOverrides: [
              {
                actionToUse: {
                  challenge: {},
                },
                name: "TGT_VolumetricIpTokenAbsent",
              },
              {
                actionToUse: {
                  challenge: {},
                },
                name: "SignalNonBrowserUserAgent",
              },
              {
                actionToUse: {
                  challenge: {},
                },
                name: "CategoryHttpLibrary",
              },
            ],
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "AWSManagedRulesBotControlRuleSet",
        },
      },
      // If the request has a missing or reject token after a challenge then we want to block it
      {
        name: "Block-Requests-With-Missing-Or-Rejected-Token-Label",
        priority: 2,
        action: { block: {} },
        statement: {
          andStatement: {
            statements: [
              {
                orStatement: {
                  statements: [
                    {
                      labelMatchStatement: {
                        scope: "LABEL",
                        key: "awswaf:managed:token:absent",
                      },
                    },
                    {
                      labelMatchStatement: {
                        scope: "LABEL",
                        key: "awswaf:managed:token:rejected",
                      },
                    },
                  ],
                },
              },
              {
                // Don't challenge an OPTIONS request
                notStatement: {
                  statement: {
                    byteMatchStatement: {
                      fieldToMatch: {
                        method: {},
                      },
                      positionalConstraint: "EXACTLY",
                      searchString: "OPTIONS",
                      textTransformations: [
                        {
                          type: "NONE",
                          priority: 0,
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "Block-Requests-With-Missing-Or-Rejected-Token-Label",
        },
      },
    ];

    // Create WAF
    const waf = new WAF.CfnWebACL(this, createName("waf"), {
      defaultAction: { allow: {} },
      // Regional as we are using WAF for API Gateway
      scope: "REGIONAL",
      name: createName("waf"),
      rules: wafRules,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: createName("waf-metrics"),
        sampledRequestsEnabled: true,
      },
      // Your front end domain, otherwise request will be reject even if the request passes the challenge
      tokenDomains: [cloudFront.domainName],
    });

    // Links the WAF to the API gateway
    new WAF.CfnWebACLAssociation(
      this,
      createName("waf-api-gateway-association"),
      {
        // API Gateway arn
        resourceArn: Fn.join("", [
          "arn:aws:apigateway:",
          Stack.of(this).region,
          "::/restapis/",
          api.restApiId,
          "/stages/",
          api.deploymentStage.stageName,
        ]),
        // Waf arn
        webAclArn: waf.attrArn,
      }
    );

    // Ensure api gateway is created first
    waf.node.addDependency(api);
  }
}
