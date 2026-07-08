// 设备管理控制台 — 非敏感配置(这些 ID 在 Flutter App 内已公开,可提交)
// 线上实际使用的是 Tokyo 池(region_config.dart:cn/ap/默认 → amplifyconfig_tokyo)。
export const REGION = 'ap-northeast-1';

export const COGNITO = {
  region: REGION,
  userPoolId: 'ap-northeast-1_yy1j7zYoi',
  userPoolClientId: '2np572gii9kvfsi1kddlid3rmk',
  identityPoolId: 'ap-northeast-1:4f20eecf-8245-44f1-af1d-ce335a359b6a',
};

export const APPSYNC = {
  endpoint: 'https://hpuaoablfjgfhjrbpdy3a3u7la.appsync-api.ap-northeast-1.amazonaws.com/graphql',
  region: REGION,
  // 默认授权方式 = API_KEY(所有 @model 都是 @auth public)。数据面 MVP 走 key;
  // 更稳可改走 Identity Pool AWS_IAM(需在 AppSync 加 IAM authorizer)。
  apiKey: 'da2-rmzpjwx7lva7zbfviuy2nwzbcy',
};

export const S3_BUCKET = 'anhaivisionwebsite-storage-77a56c21232245-tokyo';

// KVS 区域解析(移植 kvsApi.dart:cn→cn-north-1, us→us-east-2, eu→eu-west-3, 默认→ap-northeast-1)
export function resolveKvsRegion(regionCode) {
  switch (regionCode) {
    case 'cn': return 'cn-north-1';
    case 'us': return 'us-east-2';
    case 'eu': return 'eu-west-3';
    default: return 'ap-northeast-1';
  }
}

// 依赖 CDN(ESM,固定版本)。如需离线/免 CDN,可把这些下载到 vendor/ 再改成本地路径。
export const DEPS = {
  cognitoIdentityJs: 'https://esm.sh/amazon-cognito-identity-js@6.3.12',
  credentialProviders: 'https://esm.sh/@aws-sdk/credential-providers@3.658.1',
  kinesisVideo: 'https://esm.sh/@aws-sdk/client-kinesis-video@3.658.1',
  kinesisVideoArchivedMedia: 'https://esm.sh/@aws-sdk/client-kinesis-video-archived-media@3.658.1',
};
