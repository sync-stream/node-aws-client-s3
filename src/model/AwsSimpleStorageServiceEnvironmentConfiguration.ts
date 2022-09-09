import {IAwsSimpleStorageServiceConfiguration} from '../interface/IAwsSimpleStorageServiceConfiguration';
import {Environment} from 'syncstream-environment';

/**
 *
 * @class
 */
export class AwsSimpleStorageServiceEnvironmentConfiguration implements IAwsSimpleStorageServiceConfiguration {

    /**
     * This method returns our AWS access key ID for authentication
     * @public
     * @returns {string}
     * @static
     */
    public accessKeyId!: string;

    /**
     * This constant defines our AWS Simple Storage Service (S3) bucket to read and write files
     * @property
     * @public
     * @type {string}
     */
    bucket!: string;

    /**
     * This constant defines the AWS KMS Key ID to use for S3 uploads
     * @public
     * @returns {string?}
     * @static
     */
    public keyManagementServiceKeyId?: string;

    /**
     * This constant defines the AWS region our assets are in
     * @public
     * @returns {string}
     * @static
     */
    public region!: string;

    /**
     * This constant defines our AWS secret access key for authentication
     * @public
     * @returns {string}
     * @static
     */
    public secretAccessKey!: string;

    /**
     * This property contains the custom user-agent string for the client
     * @property
     * @public
     * @type {string?}
     */
    public userAgent?: string;

    /**
     * This method bootstraps the configuration from the application's environment
     * @constructor
     * @public
     */
    public constructor() {

        // Set the access key ID into the instance from the application's environment
        this.accessKeyId =
            (Environment.getEnvironmentVariable<string>('SS_AWS_ACCESS_KEY_ID', '') as string);

        // Set the default bucket into the instance from the application's environment
        this.bucket =
            (Environment.getEnvironmentVariable<string>('SS_AWS_S3_BUCKET', '') as string);

        // Set the KMS key ID into the instance from the application's environment
        this.keyManagementServiceKeyId =
            Environment.getEnvironmentVariable<string>('SS_AWS_KMS_KEY_ID');

        // Set the region into the instance from the application's environment
        this.region =
            (Environment.getEnvironmentVariable<string>('SS_AWS_REGION', 'us-east-1') as string);

        // Set the secret access key into the instance from the application's environment
        this.secretAccessKey =
            (Environment.getEnvironmentVariable<string>('SS_AWS_SECRET_ACCESS_KEY', '') as string);

        // Set the custom user-agent string into the instance from the application's environment
        this.userAgent =
            Environment.getEnvironmentVariable('SS_AWS_CLIENT_USER_AGENT');


        // Configure the application's environment
        this.configureApplicationEnvironment();
    }

    /**
     * This method configures the application's environment for AWS
     * @public
     * @returns {void}
     */
    public configureApplicationEnvironment(): void {

        // Set the AWS Access Key ID into the application's environment
        Environment.setEnvironmentVariable('AWS_ACCESS_KEY_ID', this.accessKeyId, false);

        // Set the AWS Region into the application's environment
        Environment.setEnvironmentVariable('AWS_REGION', this.region, false);

        // Set the AWS Secret Access Key into the application's environment
        Environment.setEnvironmentVariable('AWS_SECRET_ACCESS_KEY', this.secretAccessKey, false);
    }
}