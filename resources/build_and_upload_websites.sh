#!/bin/sh

if [ "X$1" = "X" ]; then
    echo "usage: $0 STACK_NAME DOMAIN_NAME"
    exit 2
fi

if [ "X$2" = "X" ]; then
    echo "usage: $0 STACK_NAME DOMAIN_NAME"
    exit 2
fi
STACK_NAME=$1
DOMAINNAME=$2

ADMIN_SITE_BUCKET=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-EksRefArchAdminAppBucket'].Value" --output text)
APP_SITE_BUCKET=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-EksRefArchAppBucket'].Value" --output text)
LANDING_SITE_BUCKET=$(aws cloudformation list-exports --query "Exports[?Name=='${STACK_NAME}-EksRefArchLandingAppBucket'].Value" --output text)

export NVM_DIR=$HOME/.nvm;
source $NVM_DIR/nvm.sh;
nvm install 12.16
nvm use 12.16
npm install @angular/cli@9.1.0

sh ./resources/build_and_upload_admin_site.sh ${STACK_NAME} $ADMIN_SITE_BUCKET $DOMAINNAME
sh ./resources/build_and_upload_app_site.sh $APP_SITE_BUCKET $DOMAINNAME
sh ./resources/build_and_upload_landing_site.sh $LANDING_SITE_BUCKET $DOMAINNAME

