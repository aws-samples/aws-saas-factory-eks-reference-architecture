# EKS SaaS - Reference Solution

The code provide here is intended to provide a sample implementation of a SaaS EKS solution. The goal is to provide SaaS developers and architects with working code that will illustrate how multi-tenant SaaS applications can be design and delivered on AWS. The solution covers a broad range of multi-tenant considerations, including tenant isolation, identity, data partitioning, and deployment. It provides developers with a prescriptive approach the the fundamentals of building SaaS solution with EKS. The focus here is more on giving developers a view into the working elements of the solution without going to the extent of making a full, production-ready solution. Instead, we're hoping this can jump start your process and address some of the common challenges that teams must address when delivering a SaaS solution with EKS.

Note that the instructions below are intended to give you step-by-step, how-to instructions for getting this solution up and running in your own AWS account. For a general description and overview of the solution, please see the [developer's guide here](GUIDE.md).

## Setting up the environment

> :warning: The Cloud9 workspace should be built by an IAM user with Administrator privileges, not the root account user. Please ensure you are logged in as an IAM user, not the root account user.

> :warning: This architecture requires an external domain name for which you control DNS settings. If you don't currently own a domain name, you can purchase usually for under $5. namecheap.com is a great resource for this.

1. Create a Route53 Hosted Zone
    > :warning: If you already have a hosted zone for your domain, just take note of its ID (final step in this block)
    * Open the AWS Console and ensure you're using a region where EKS is supported. Consult [this link](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/) for more information.
    * Navigate to the `Route53` service and click the `Hosted Zones` link on the left nav
    * Click the orange `Create Hosted Zone` Button
    * In the Domain Name input, enter your domain name. Ex: example.com. Note, do not include any subdomains (i.e. www. or app.) and click the orange `Create hosted Zone` button
    * In the Hosted Zone details page, take note of the four name servers for your domain in the NS row of the details. They will look something like this:

        ```code
            ns-111.awsdns-11.com.
            ns-222.awsdns-22.net.
            ns-3333.awsdns-33.co.uk.
            ns-444.awsdns-44.org.
        ```

    * Back in your Domain Provider's website, manage the DNS for your domain and update and add all four nameservers (without the trailing period) to your domain's nameserver list
    * Back on the AWS console, click the `Hosted Zones` link in the left nav and take note (or copy to the clipboard) of the ID for the hosted zone you just created. It'll look something like this: Z1234567KVVZTHQRRIIP
2. Create new Cloud9 Environment
    * Launch Cloud9 in your closest region Ex: `https://us-west-2.console.aws.amazon.com/cloud9/home?region=us-west-2`
    * Select Create environment
    * Name it whatever you want, click Next.
    * Choose “t3.small” for instance type, take all default values and click Create environment
3. Create EC2 Instance Role
    * Follow this [deep link](https://console.aws.amazon.com/iam/home#/roles$new?step=review&commonUseCase=EC2%2BEC2&selectedUseCase=EC2&policies=arn:aws:iam::aws:policy%2FAdministratorAccess) to create an IAM role with Administrator access.
    * Confirm that AWS service and EC2 are selected, then click Next to view permissions.* Confirm that AdministratorAccess is checked, then click `Next: Tags` to assign tags.
    * Take the defaults, and click `Next: Review` to review.
    * Enter `eks-ref-arch-admin` for the Name, and click `Create role`.
4. Remove managed credentials and attach EC2 Instance Role to Cloud9 Instance
    * Click the gear in the upper right-hand corner of the IDE which opens settings. Click the `AWS Settings` on the left and under `Credentials` slide the button to the left for `AWS Managed Temporary Credentials. The button should be greyed out when done with an x to the right indicating it's off.
    * Click the round Button with an alphabet in the upper right-hand corner of the IDE and click `Manage EC2 Instance`. This will take you the EC2 portion of the AWS Console
    * Right-click the EC2 instance and in the fly-out menu, click `Security` -> `Modify IAM Role`
    * Choose the Role you created in step 3 above. It should be titled "eks-ref-arch-admin" and click `Save`.
5. Clone the repo and run the setup script
    * Return to the Cloud9 IDE
    * In the upper left part of the main screen, click the round green button with a `+` on it and click `New Terminal`
    * Enter the following in the terminal window

    ```bash
    git clone https://github.com/aws-samples/aws-saas-factory-eks-reference-architecture
    cd aws-saas-factory-eks-reference-architecture
    chmod +x setup.sh
    ./setup.sh
   ```

   This [script](./setup.sh) sets up all Kubernetes tools, updates the AWS CLI and installs other dependencies that we'll use later. Take note of the final output of this script. If everything worked correctly, you should see the message that the you're good to continue creating the EKS cluster. If you do not see this message, please do not continue. Ensure that the Administrator EC2 role was created and successfully attached to the EC2 instance that's running your Cloud9 IDE. Also ensure you turned off `AWS Managed Credentials` inside your Cloud9 IDE (refer to steps 2 and 3).

6. Create the EKS Cluster
    * Run the following script to create a cluster configuration file, and subsequently provision the cluster using `eksctl`:

    ```bash
    chmod +x deploy-cluster.sh
    ./deploy-cluster.sh
    ```

    The cluster will take approximately 30 minutes to deploy.

7. Deploy supporting infrastructure
    > :warning: Close the terminal window that you create the cluster in, and open a new terminal before starting this step otherwise you may get errors about your AWS_REGION not set.
    * Open a **_NEW_** terminal window and `cd` back into `aws-saas-factory-eks-reference-architecture` and run the following script:

    ```bash
    chmod +x deploy.sh
    ./deploy.sh <ADMIN_EMAIL> <STACK_NAME> <DOMAIN_NAME> <HOSTED_ZONE_ID>
    ```

    Where Admin Email is the email address of the SaaS Admin. Stack Name is whatever name you want to give to the CloudFormation stack which gets deployed. Domain Name is the actual domain that you're bringing to this scenario, e.g. my-eks-domain.com. Lastly Hosted Zone ID is the ID of the Route53 hosted zone for this domain (you created or recorded in step 1 of this guide)

    :warning: Important: During the Stack provisioning a Nested Stack is created for provisioning a Certificate to be used by the application. Open ACM service and you will find the status of the certificate is in "Pending Validation". Expand the Certificate and look for the two domains that was created. Look for the button "Create record in Route 53" and click. This will update the DNS configuration by adding a new entry in Route 53. Within a few minutes, the certificate status will change to "Issued". At this point you will see the Cloudformation AppCert nested stack will continue with its provisioning.

    This [script](./deploy.sh) creates a unique S3 Bucket and uploads our CloudFormation artifacts to that bucket. It then kicks off a CloudFormation stack with all the supporting pieces for our EKS Reference Architecture, including our CloudFront distributions for both the administration and tenant websites, as well as a wildcard certificate to provision those sites and corresponding bucket policies. It also creates the DynamoDB Tables used by our shared microservices for Tenant and User management and registration.

    This stack may take up to an hour to complete.

    Once the CloudFormation stack completes, this script initiates various other scripts to do the following:

    1. Build the tenant application and tenant administration websites, and upload them to their corresponding S3 Bucket fronted by a CloudFront distribution

    2. Build, Dockerize and upload the microservice containers to our ECR Repo

    3. Install External DNS and Nginx Controller in our EKS Cluster

    4. Configure out Tenant Provisioning Pipeline with information from this installation

    5. Update the worker nodes in our EKS Cluster with additional IAM permissions required to provision our tenants

    6. Update the CodeCommit repo with artifacts required to support our tenant provisioning pipeline

8. Once finished, the following websites should be provisioned and ready for you to use:

    [https://www.YOURDOMAIN.com](https://www.YOURDOMAIN.com) - This is the "landing page" for your multi-tenant e-Commerce platform. From this page, customers can self-signup for a new account
    [https://admin.YOURDOMAIN.com](https://admin.YOURDOMAIN.com) - This is the "administration" page for your multi-tenant e-Commerce platform. From this page, your tenant administrator can view global statistics for the platform and onboard new tenants. In a normal application, this page would be behind some strict security. We've left this page entirely anonymous for demonstration purposes.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

