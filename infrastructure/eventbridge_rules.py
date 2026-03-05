"""EventBridge rules configuration for Admin Panel BFF subscriptions.

Creates one EventBridge rule per subscribed event type on the
``ugsys-event-bus`` event bus, targeting the Admin Panel Lambda function.

Subscribed event types (Requirements 12.1):
    identity.user.created
    identity.user.updated
    identity.user.deleted
    identity.user.role_changed
    identity.auth.login_failed

Usage::

    # Dry-run (print rules without creating them):
    python infrastructure/eventbridge_rules.py --dry-run

    # Create rules in AWS (requires AWS credentials):
    python infrastructure/eventbridge_rules.py

    # Specify a custom Lambda ARN and region:
    python infrastructure/eventbridge_rules.py \\
        --lambda-arn arn:aws:lambda:us-east-1:123456789012:function:admin-panel-events \\
        --region us-east-1

Environment variables (override CLI flags):
    LAMBDA_ARN          — Lambda function ARN to use as rule target
    AWS_DEFAULT_REGION  — AWS region (default: us-east-1)
    EVENT_BUS_NAME      — EventBridge bus name (default: ugsys-event-bus)

Requirements: 12.1
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EVENT_BUS_NAME = os.environ.get("EVENT_BUS_NAME", "ugsys-event-bus")
EVENT_SOURCE = "identity-manager"
LAMBDA_ARN_PLACEHOLDER = "${LAMBDA_ARN}"

# One rule per subscribed event type.
SUBSCRIBED_EVENT_TYPES: list[str] = [
    "identity.user.created",
    "identity.user.updated",
    "identity.user.deleted",
    "identity.user.role_changed",
    "identity.auth.login_failed",
]


# ---------------------------------------------------------------------------
# Rule builders
# ---------------------------------------------------------------------------


def build_event_pattern(event_type: str) -> dict[str, Any]:
    """Return an EventBridge event pattern that matches *event_type*."""
    return {
        "source": [EVENT_SOURCE],
        "detail-type": [event_type],
    }


def build_rule(event_type: str, lambda_arn: str) -> dict[str, Any]:
    """Return a dict describing a single EventBridge rule."""
    # Rule names must be unique within a bus; use the event type slug.
    rule_name = f"admin-panel--{event_type.replace('.', '-')}"
    return {
        "Name": rule_name,
        "EventBusName": EVENT_BUS_NAME,
        "EventPattern": json.dumps(build_event_pattern(event_type)),
        "State": "ENABLED",
        "Description": (
            f"Routes '{event_type}' events from identity-manager "
            "to the Admin Panel Lambda handler."
        ),
        "Targets": [
            {
                "Id": "admin-panel-lambda",
                "Arn": lambda_arn,
            }
        ],
    }


def build_all_rules(lambda_arn: str) -> list[dict[str, Any]]:
    """Return rule definitions for all subscribed event types."""
    return [build_rule(et, lambda_arn) for et in SUBSCRIBED_EVENT_TYPES]


# ---------------------------------------------------------------------------
# AWS deployment
# ---------------------------------------------------------------------------


def deploy_rules(rules: list[dict[str, Any]], region: str) -> None:
    """Create or update EventBridge rules and add Lambda targets.

    Parameters
    ----------
    rules:
        List of rule dicts as returned by :func:`build_all_rules`.
    region:
        AWS region where the rules should be created.
    """
    try:
        import boto3
    except ImportError:
        print("boto3 is required to deploy rules. Install it with: pip install boto3", file=sys.stderr)
        sys.exit(1)

    client = boto3.client("events", region_name=region)

    for rule in rules:
        targets = rule.pop("Targets")
        rule_name = rule["Name"]

        # Create or update the rule.
        response = client.put_rule(**rule)
        rule_arn = response["RuleArn"]
        print(f"  ✓ Rule '{rule_name}' → {rule_arn}")

        # Attach the Lambda target.
        client.put_targets(
            Rule=rule_name,
            EventBusName=rule["EventBusName"],
            Targets=targets,
        )
        print(f"    Target: {targets[0]['Arn']}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create EventBridge rules for Admin Panel BFF subscriptions.",
    )
    parser.add_argument(
        "--lambda-arn",
        default=os.environ.get("LAMBDA_ARN", LAMBDA_ARN_PLACEHOLDER),
        help="Lambda function ARN (default: $LAMBDA_ARN env var or placeholder).",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        help="AWS region (default: $AWS_DEFAULT_REGION or us-east-1).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print rule definitions without creating them in AWS.",
    )
    args = parser.parse_args()

    rules = build_all_rules(args.lambda_arn)

    if args.dry_run:
        print(f"EventBridge rules for bus '{EVENT_BUS_NAME}' (dry-run):\n")
        print(json.dumps(rules, indent=2))
        return

    if args.lambda_arn == LAMBDA_ARN_PLACEHOLDER:
        print(
            "Error: --lambda-arn is required (or set the LAMBDA_ARN environment variable).",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Creating {len(rules)} EventBridge rules in region '{args.region}'...\n")
    deploy_rules(rules, region=args.region)
    print("\nDone.")


if __name__ == "__main__":
    main()
