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
        name: "AWSManagedRulesBotControlRuleSet",
        priority: 1,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesBotControlRuleSet",
            scopeDownStatement: {
              andStatement: {
                statements: [
                  {
                    byteMatchStatement: {
                      fieldToMatch: { uriPath: {} },
                      positionalConstraint: "CONTAINS",
                      searchString: "api",
                      textTransformations: [
                        {
                          priority: 0,
                          type: "LOWERCASE",
                        },
                      ],
                    },
                  },
                  {
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
                  inspectionLevel: "TARGETED",
                },
              },
            ],
            ruleActionOverrides: [
              {
                actionToUse: {
                  captcha: {},
                },
                name: "TGT_VolumetricIpTokenAbsent",
              },
              {
                actionToUse: {
                  captcha: {},
                },
                name: "SignalNonBrowserUserAgent",
              },
              {
                actionToUse: {
                  captcha: {},
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

    const waf = new WAF.CfnWebACL(this, createName("waf"), {
      defaultAction: { allow: {} },
      scope: "REGIONAL",
      name: createName("waf"),
      rules: wafRules,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: createName("waf-metrics"),
        sampledRequestsEnabled: true,
      },
      tokenDomains: [cloudFront.domainName],
    });

    // new WAF.CfnWebACLAssociation(
    //   this,
    //   createName("waf-api-gateway-association"),
    //   {
    //     resourceArn: Fn.join("", [
    //       "arn:aws:apigateway:",
    //       Stack.of(this).region,
    //       "::/restapis/",
    //       api.restApiId,
    //       "/stages/",
    //       api.deploymentStage.stageName,
    //     ]),
    //     webAclArn: waf.attrArn,
    //   }
    // );

    // waf.node.addDependency(api);
  }
}
