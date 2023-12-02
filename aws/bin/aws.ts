#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { WafChallenge } from "../lib/waf-challenge";

const app = new cdk.App();
new WafChallenge(app, "AwsStack", {});
