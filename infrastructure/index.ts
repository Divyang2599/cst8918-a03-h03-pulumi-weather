import * as pulumi from '@pulumi/pulumi'
import * as resources from '@pulumi/azure-native/resources'
import * as containerregistry from '@pulumi/azure-native/containerregistry'
import * as dockerBuild from '@pulumi/docker-build'
import * as containerinstance from '@pulumi/azure-native/containerinstance'
import * as redisModule from '@pulumi/azure-native/redis'

const config = new pulumi.Config()
const appPath = config.require('appPath')
const prefixName = config.require('prefixName')
const imageName = prefixName
const imageTag = config.require('imageTag')
const containerPort = config.requireNumber('containerPort')
const publicPort = config.requireNumber('publicPort')
const cpu = config.requireNumber('cpu')
const memory = config.requireNumber('memory')

const resourceGroup = new resources.ResourceGroup(`${prefixName}-rg`)

const redisCache = new redisModule.Redis(`${prefixName}-redis`, {
  name: `${prefixName}-weather-cache`,
  location: 'canadacentral',
  resourceGroupName: resourceGroup.name,
  enableNonSslPort: true,
  redisVersion: 'Latest',
  minimumTlsVersion: '1.2',
  redisConfiguration: { maxmemoryPolicy: 'allkeys-lru' },
  sku: { name: 'Basic', family: 'C', capacity: 0 },
})

const redisAccessKey = redisModule.listRedisKeysOutput({
  name: redisCache.name,
  resourceGroupName: resourceGroup.name,
}).apply((keys: any) => keys.primaryKey)

const redisConnectionString = pulumi.interpolate`rediss://:${redisAccessKey}@${redisCache.hostName}:${redisCache.sslPort}`

const registry = new containerregistry.Registry(`${prefixName.replace(/-/g, '')}ACR`, {
  resourceGroupName: resourceGroup.name,
  adminUserEnabled: true,
  sku: { name: containerregistry.SkuName.Basic },
})

const registryCredentials = containerregistry
  .listRegistryCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
  })
  .apply((creds) => ({
    username: creds.username!,
    password: creds.passwords![0].value!,
  }))

const image = new dockerBuild.Image(`${prefixName}-image`, {
  tags: [pulumi.interpolate`${registry.loginServer}/${imageName}:${imageTag}`],
  context: { location: appPath },
  dockerfile: { location: `${appPath}/Dockerfile` },
  platforms: ['linux/amd64', 'linux/arm64'],
  push: true,
  registries: [
    {
      address: registry.loginServer,
      username: registryCredentials.username,
      password: registryCredentials.password,
    },
  ],
})

const containerGroup = new containerinstance.ContainerGroup(
  `${prefixName}-container-group`,
  {
    resourceGroupName: resourceGroup.name,
    osType: 'linux',
    restartPolicy: 'always',
    imageRegistryCredentials: [
      {
        server: registry.loginServer,
        username: registryCredentials.username,
        password: registryCredentials.password,
      },
    ],
    containers: [
      {
        name: imageName,
        image: image.ref,
        ports: [{ port: containerPort, protocol: 'tcp' }],
        environmentVariables: [
          {
            name: 'PORT',
            value: containerPort.toString(),
          },
          {
            name: 'WEATHER_API_KEY',
            value: config.requireSecret('weatherApiKey'),
          },
          {
            name: 'REDIS_URL',
            value: redisConnectionString,
          },
        ],
        resources: {
          requests: { cpu: cpu, memoryInGB: memory },
        },
      },
    ],
    ipAddress: {
      type: containerinstance.ContainerGroupIpAddressType.Public,
      dnsNameLabel: imageName,
      ports: [{ port: publicPort, protocol: 'tcp' }],
    },
  },
)

export const hostname = containerGroup.ipAddress.apply((addr) => addr!.fqdn!)
export const ip = containerGroup.ipAddress.apply((addr) => addr!.ip!)
export const url = containerGroup.ipAddress.apply(
  (addr) => `http://${addr!.fqdn!}:${containerPort}`,
)