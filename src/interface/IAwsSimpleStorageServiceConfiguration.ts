/**
 * This interface maintains the structure of our AWS Simple Storage Service (S3) configuration
 * @interface
 */
export interface IAwsSimpleStorageServiceConfiguration {

    /**
     * This method returns our AWS access key ID for authentication
     * @property
     * @public
     * @type {string}
     */
    accessKeyId: string;

    /**
     * This constant defines our AWS Simple Storage Service (S3) bucket to read and write files
     * @property
     * @public
     * @type {string}
     */
    bucket: string;

    /**
     * This constant defines the AWS KMS Key ID to use for S3 uploads
     * @property
     * @public
     * @type {string?}
     */
    keyManagementServiceKeyId?: string;

    /**
     * This constant defines the AWS region our assets are in
     * @property
     * @public
     * @type {string}
     */
    region: string;

    /**
     * This constant defines our AWS secret access key for authentication
     * @property
     * @public
     * @type {string}
     */
    secretAccessKey: string;

    /**
     * This property contains the custom user-agent string for the client
     * @property
     * @public
     * @type {string?}
     */
    userAgent?: string;
}