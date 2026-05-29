import * as pulumi from '@pulumi/pulumi'
import * as resources from '@pulumi/azure-native/resources'
import * as containerregistry from '@pulumi/azure-native/containerregistry'
import * as dockerBuild from '@pulumi/docker-build'
import * as containerinstance from '@pulumi/azure-native/containerinstance'

// --- LOAD CONFIG ---
// Pulumi reads from Pulumi.prod.yaml. Using config.require() means
// Pulumi will FAIL FAST if a value is missing — better than silent bugs.
const config = new pulumi.Config()
const appPath = config.require('appPath')
const prefixName = config.require('prefixName')
const imageName = prefixName
const imageTag = config.require('imageTag')
const containerPort = config.requireNumber('containerPort')
const publicPort = config.requireNumber('publicPort')
const cpu = config.requireNumber('cpu')
const memory = config.requireNumber('memory')

// --- RESOURCE GROUP ---
// A resource group is Azure's way of grouping related resources together.
// It lets you see cost, manage access, and delete everything at once.
const resourceGroup = new resources.ResourceGroup(`${prefixName}-rg`)

// --- CONTAINER REGISTRY ---
// ACR = Azure Container Registry. It's like Docker Hub but private and
// hosted in your Azure subscription. Your container images live here.
// Basic SKU = cheapest tier, fine for learning.
const registry = new containerregistry.Registry(`${prefixName.replace(/-/g, '')}ACR`, {
  resourceGroupName: resourceGroup.name,
  adminUserEnabled: true,
  sku: {
    name: containerregistry.SkuName.Basic,
  },
})

// --- REGISTRY CREDENTIALS ---
// To push images TO the registry (from Docker) and pull images FROM it
// (by ACI), we need credentials. This fetches them after the registry
// is created. The .apply() pattern is Pulumi's way of saying:
// "once this async value resolves, transform it like this."
const registryCredentials = containerregistry
  .listRegistryCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
  })
  .apply((creds) => ({
    username: creds.username!,
    password: creds.passwords![0].value!,
  }))

// --- DOCKER IMAGE ---
// This builds your app using the Dockerfile, tags it with the version,
// and pushes it to ACR. The `target: 'production'` tells Docker to use
// the production stage of the multi-stage Dockerfile.
// Building for both amd64 and arm64 = works on Intel/AMD and Apple Silicon.
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

// --- CONTAINER GROUP (ACI) ---
// ACI = Azure Container Instances. It's the simplest way to run a
// container in Azure — no Kubernetes complexity, just "run this image."
// A ContainerGroup is ACI's unit of deployment (can hold multiple containers).
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

// --- OUTPUTS ---
// These print to the terminal after `pulumi up` so you know where your app is.
export const hostname = containerGroup.ipAddress.apply((addr) => addr!.fqdn!)
export const ip = containerGroup.ipAddress.apply((addr) => addr!.ip!)
export const url = containerGroup.ipAddress.apply(
  (addr) => `http://${addr!.fqdn!}:${containerPort}`,
)