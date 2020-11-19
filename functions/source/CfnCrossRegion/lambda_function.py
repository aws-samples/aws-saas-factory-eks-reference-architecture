"""
Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"""
import boto3
import random
import string
import logging
import threading
from botocore.vendored import requests
import json
from botocore.credentials import (
    AssumeRoleCredentialFetcher,
    CredentialResolver,
    DeferredRefreshableCredentials
)
from botocore.session import Session
from botocore.exceptions import ClientError


cfn_states = {
    "failed": ["CREATE_FAILED", "ROLLBACK_IN_PROGRESS", "ROLLBACK_FAILED", "ROLLBACK_COMPLETE", "DELETE_FAILED",
               "UPDATE_ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_FAILED", "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS",
               "UPDATE_ROLLBACK_COMPLETE"],
    "in_progress": ["CREATE_IN_PROGRESS", "DELETE_IN_PROGRESS", "UPDATE_IN_PROGRESS",
                    "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS"],
    "success": ["CREATE_COMPLETE", "DELETE_COMPLETE", "UPDATE_COMPLETE"]
}


def log_config(event, loglevel=None, botolevel=None):
    if 'ResourceProperties' in event.keys():
        if 'loglevel' in event['ResourceProperties'] and not loglevel:
            loglevel = event['ResourceProperties']['loglevel']
        if 'botolevel' in event['ResourceProperties'] and not botolevel:
            botolevel = event['ResourceProperties']['botolevel']
    if not loglevel:
        loglevel = 'warning'
    if not botolevel:
        botolevel = 'error'
    # Set log verbosity levels
    loglevel = getattr(logging, loglevel.upper(), 20)
    botolevel = getattr(logging, botolevel.upper(), 40)
    mainlogger = logging.getLogger()
    mainlogger.setLevel(loglevel)
    logging.getLogger('boto3').setLevel(botolevel)
    logging.getLogger('botocore').setLevel(botolevel)
    # Set log message format
    logfmt = '[%(requestid)s][%(asctime)s][%(levelname)s] %(message)s \n'
    mainlogger.handlers[0].setFormatter(logging.Formatter(logfmt))
    return logging.LoggerAdapter(mainlogger, {'requestid': event['RequestId']})


def send(event, context, response_status, response_data, physical_resource_id, logger, reason=None):

    response_url = event['ResponseURL']
    logger.debug("CFN response URL: " + response_url)

    response_body = dict()
    response_body['Status'] = response_status
    msg = 'See details in CloudWatch Log Stream: ' + context.log_stream_name
    if not reason:
        response_body['Reason'] = msg
    else:
        response_body['Reason'] = str(reason)[0:255] + '... ' + msg

    if physical_resource_id:
        response_body['PhysicalResourceId'] = physical_resource_id
    elif 'PhysicalResourceId' in event:
        response_body['PhysicalResourceId'] = event['PhysicalResourceId']
    else:
        response_body['PhysicalResourceId'] = context.log_stream_name

    response_body['StackId'] = event['StackId']
    response_body['RequestId'] = event['RequestId']
    response_body['LogicalResourceId'] = event['LogicalResourceId']
    if response_data and response_data != {} and response_data != [] and isinstance(response_data, dict):
        response_body['Data'] = response_data

    json_response_body = json.dumps(response_body)

    logger.debug("Response body:\n" + json_response_body)

    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }

    try:
        response = requests.put(response_url,
                                data=json_response_body,
                                headers=headers)
        logger.info("CloudFormation returned status code: " + response.reason)
    except Exception as e:
        logger.error("send(..) failed executing requests.put(..): " + str(e))
        raise


# Function that executes just before lambda excecution times out
def timeout(event, context, logger):
    logger.error("Execution is about to time out, sending failure message")
    send(event, context, "FAILED", {}, "", reason="Execution timed out", logger=logger)


# Handler function
def cfn_handler(event, context, create_func, update_func, delete_func, logger, init_failed):
    print("**3**")
    logger.info("Lambda RequestId: %s CloudFormation RequestId: %s" %
                (context.aws_request_id, event['RequestId']))

    # Define an object to place any response information you would like to send
    # back to CloudFormation (these keys can then be used by Fn::GetAttr)
    response_data = {}
    print("**4**")

    # Define a physicalId for the resource, if the event is an update and the
    # returned phyiscalid changes, cloudformation will then issue a delete
    # against the old id
    physical_resource_id = None
    print("**4**")

    logger.debug("EVENT: " + json.dumps(event))
    print("**5**")
    # handle init failures
    if init_failed:
        print("**6**")
        send(event, context, "FAILED", response_data, physical_resource_id, init_failed, logger)
        raise init_failed

    # Setup timer to catch timeouts
    t = threading.Timer((context.get_remaining_time_in_millis()/1000.00)-0.5,
                        timeout, args=[event, context, logger])
    t.start()

    try:
        # Execute custom resource handlers
        print("**7**")
        logger.info("Received a %s Request" % event['RequestType'])
        print("Received a %s Request" % event['RequestType'])
        if 'Poll' in event.keys():
            physical_resource_id, response_data = poll(event, context)
        elif event['RequestType'] == 'Create':
            physical_resource_id, response_data = create_func(event, context)
        elif event['RequestType'] == 'Update':
            physical_resource_id, response_data = update_func(event, context)
        elif event['RequestType'] == 'Delete':
            physical_resource_id, response_data = delete_func(event, context)

        if "Complete" in response_data.keys():
            # Removing lambda schedule for poll
            if 'Poll' in event.keys():
                remove_poll(event, context)

            logger.info("Completed successfully, sending response to cfn")
            send(event, context, "SUCCESS", cleanup_response(response_data), physical_resource_id, logger=logger)
        else:
            logger.info("Stack operation still in progress, not sending any response to cfn")

    # Catch any exceptions, log the stacktrace, send a failure back to
    # CloudFormation and then raise an exception
    except Exception as e:
        reason = str(e)
        logger.error(e, exc_info=True)
        try:
            remove_poll(event, context)
        except Exception as e2:
            logger.error("Failed to remove polling event")
            logger.error(e2, exc_info=True)
        send(event, context, "FAILED", cleanup_response(response_data), physical_resource_id, reason=reason, logger=logger)
    finally:
        t.cancel()


def cleanup_response(response_data):
    for k in ["Complete", "Poll", "permission", "rule"]:
        if k in response_data.keys():
            del response_data[k]
    return response_data


class AssumeRoleProvider(object):
    METHOD = 'assume-role'

    def __init__(self, fetcher):
        self._fetcher = fetcher

    def load(self):
        return DeferredRefreshableCredentials(
            self._fetcher.fetch_credentials,
            self.METHOD
        )


def assume_role(session: Session,
                role_arn: str,
                duration: int = 3600,
                session_name: str = None) -> Session:
    # noinspection PyTypeChecker
    fetcher = AssumeRoleCredentialFetcher(
        session.create_client,
        session.get_credentials(),
        role_arn,
        extra_args={
            'DurationSeconds': duration,
            'RoleSessionName': session_name
        }
    )
    role_session = Session()
    role_session.register_component(
        'credential_provider',
        CredentialResolver([AssumeRoleProvider(fetcher)])
    )
    return role_session


def rand_string(l):
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(l))


def get_cfn_parameters(event):
    params = []
    for p in event['ResourceProperties']['CfnParameters'].keys():
        params.append({"ParameterKey": p, "ParameterValue": event['ResourceProperties']['CfnParameters'][p]})
    return params


def add_permission(context, rule_arn):
    sid = 'QuickStartStackMaker-' + rand_string(8)
    lambda_client.add_permission(
        FunctionName=context.function_name,
        StatementId=sid,
        Action='lambda:InvokeFunction',
        Principal='events.amazonaws.com',
        SourceArn=rule_arn
    )
    return sid


def put_rule():
    response = events_client.put_rule(
        Name='QuickStartStackMaker-' + rand_string(8),
        ScheduleExpression='rate(2 minutes)',
        State='ENABLED',

    )
    return response["RuleArn"]


def put_targets(func_name, event):
    region = event['rule'].split(":")[3]
    account_id = event['rule'].split(":")[4]
    rule_name = event['rule'].split("/")[1]
    events_client.put_targets(
        Rule=rule_name,
        Targets=[
            {
                'Id': '1',
                'Arn': 'arn:aws:lambda:%s:%s:function:%s' % (region, account_id, func_name),
                'Input': json.dumps(event)
            }
        ]
    )


def remove_targets(rule_arn):
    events_client.remove_targets(
        Rule=rule_arn.split("/")[1],
        Ids=['1']
    )


def remove_permission(context, sid):
    lambda_client.remove_permission(
        FunctionName=context.function_name,
        StatementId=sid
    )


def delete_rule(rule_arn):
    events_client.delete_rule(
        Name=rule_arn.split("/")[1]
    )


def setup_poll(event, context):
    event['rule'] = put_rule()
    event['permission'] = add_permission(context, event['rule'])
    put_targets(context.function_name, event)


def remove_poll(event, context):
    error = False
    if 'rule' in event.keys():
        remove_targets(event['rule'])
    else:
        loga.error("Cannot remove CloudWatch events rule, Rule arn not available in event")
        error = True
    if 'permission' in event.keys():
        remove_permission(context, event['permission'])
    else:
        loga.error("Cannot remove lambda events permission, permission id not available in event")
        error = True
    if 'rule' in event.keys():
        delete_rule(event['rule'])
    else:
        loga.error("Cannot remove CloudWatch events target, Rule arn not available in event")
        error = True
    if error:
        raise Exception("failed to cleanup CloudWatch event polling")


def create(event, context):
    """
    Create a cfn stack using an assumed role
    """
    print("**8**")
    cfn_capabilities = []
    if 'capabilities' in event['ResourceProperties'].keys():
        cfn_capabilities = event['ResourceProperties']['Capabilities']
    cfn_client = boto3.client("cloudformation")
    params = get_cfn_parameters(event)
    prefix = event['ResourceProperties']['ParentStackId'].split("/")[1]
    suffix = "-" + event["LogicalResourceId"] + "-" + rand_string(13)
    parent_properties = cfn_client.describe_stacks(StackName=prefix)['Stacks'][0]
    cfn_client = get_client("cloudformation", event, context)
    prefix_length = len(prefix)
    suffix_length = len(suffix)
    if prefix_length + suffix_length > 128:
        prefix = prefix[:128-suffix_length]
    stack_name = prefix + suffix
    capabilities = []
    if 'Capabilities' in parent_properties.keys():
        capabilities = parent_properties['Capabilities']
    print("**9**")
    print(event['ResourceProperties']['TemplateURL'])
    print(parent_properties)
    response = cfn_client.create_stack(
        StackName=stack_name,
        TemplateURL=event['ResourceProperties']['TemplateURL'],
        Parameters=params,
        Capabilities=capabilities,
        DisableRollback=parent_properties['DisableRollback'],
        NotificationARNs=parent_properties['NotificationARNs'],
        RollbackConfiguration=parent_properties['RollbackConfiguration'],
        Tags=[{
            'Key': 'ParentStackId',
            'Value': event['ResourceProperties']['ParentStackId']
        }] + parent_properties['Tags']
    )
    physical_resource_id = response['StackId']
    event["Poll"] = True
    event["PhysicalResourceId"] = physical_resource_id
    setup_poll(event, context)
    return physical_resource_id, {}


def update(event, context):
    """
    Update a cfn stack using an assumed role
    """
    stack_id = event["PhysicalResourceId"]
    cfn_capabilities = []
    if 'capabilities' in event['ResourceProperties'].keys():
        cfn_capabilities = event['ResourceProperties']['capabilities']
    cfn_client = get_client("cloudformation", event, context)
    physical_resource_id = stack_id
    try:
        cfn_client.update_stack(
            StackName=stack_id,
            TemplateURL=event['ResourceProperties']['TemplateURL'],
            Parameters=get_cfn_parameters(event),
            Capabilities=cfn_capabilities,
            Tags=[{
                'Key': 'ParentStackId',
                'Value': event['ResourceProperties']['ParentStackId']
            }]
        )
    except ClientError as e:
        if "No updates are to be performed" not in str(e):
            raise
    event["Poll"] = True
    setup_poll(event, context)
    return physical_resource_id, {}


def delete(event, context):
    """
    Delete a cfn stack using an assumed role
    """
    stack_id = event["PhysicalResourceId"]
    if '[$LATEST]' in stack_id:
        # No stack was created, so exiting
        return stack_id, {}
    cfn_client = get_client("cloudformation", event, context)
    cfn_client.delete_stack(StackName=stack_id)
    physical_resource_id = stack_id
    event["Poll"] = True
    setup_poll(event, context)
    return physical_resource_id, {}


def poll(event, context):
    stack_id = event["PhysicalResourceId"]
    cfn_client = get_client("cloudformation", event, context)
    stack = cfn_client.describe_stacks(StackName=stack_id)['Stacks'][0]
    response_data = {}
    if stack['StackStatus'] in cfn_states['failed']:
        error = "Stack launch failed, status is %s" % stack['StackStatus']
        if 'StackStatusReason' in stack.keys():
            error = "Stack Failed: %s" % stack['StackStatusReason']
        raise Exception(error)
    elif stack['StackStatus'] in cfn_states['success']:
        if 'Outputs' in stack.keys():
            for o in stack['Outputs']:
                response_data[o['OutputKey']] = o['OutputValue']
        response_data['Complete'] = True
    return stack_id, response_data


def get_client(service, event, context):
    role_arn = None
    if 'RoleArn' in event['ResourceProperties']:
        role_arn = event['ResourceProperties']['RoleArn']
    region = context.invoked_function_arn.split(":")[3]
    if "Region" in event["ResourceProperties"].keys():
        region = event["ResourceProperties"]["Region"]
    if event['RequestType'] == 'Update':
        old_role = None
        if 'RoleArn' in event['OldResourceProperties'].keys():
            old_role = event['OldResourceProperties']['RoleArn']
        if role_arn != old_role:
            raise Exception("Changing the role ARN for stack updates is not supported")
        old_region = context.invoked_function_arn.split(":")[3]
        if "Region" in event['OldResourceProperties'].keys():
            old_region = event['OldResourceProperties']['Region']
        if region != old_region:
            raise Exception("Changing the region for stack updates is not supported")
    if role_arn:
        sess = assume_role(Session(), role_arn, session_name="QuickStartCfnStack")
        client = sess.create_client(service, region_name=region)
    else:
        client = boto3.client(service, region_name=region)
    return client


# initialise logger
loga = log_config({"RequestId": "CONTAINER_INIT"})
loga.info('Logging configured')
# set global to track init failures
init_fail = False

try:
    lambda_client = boto3.client("lambda")
    events_client = boto3.client("events")
except Exception as err:
    loga.error(str(err))
    init_fail = err


def lambda_handler(event, context):
    """
    Main handler function, passes off it's work to crhelper's cfn_handler
    """
    # update the logger with event info
    global loga
    print(json.dumps(event))
    print("**1**")
    loga = log_config(event)
    print("**2**")
    return cfn_handler(event, context, create, update, delete, loga, init_fail)
