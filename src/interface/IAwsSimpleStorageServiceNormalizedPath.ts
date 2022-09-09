/**
 * This interface maintains the interface structure of an S3 normalized path
 * @interface
 */
export interface IAwsSimpleStorageServiceNormalizedPath {

    /**
     * This property denotes whether the path is a directory or not
     * @property
     * @public
     * @type {boolean}
     */
    directory: boolean;

    /**
     * This property contains the normalized path
     * @property
     * @public
     * @type {string}
     */
    path: string;
}
