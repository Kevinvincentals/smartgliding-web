// Docker Bake configuration for multi-platform builds
variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = "ghcr.io/kevinvincentals/smartgliding-web"
}

group "default" {
  targets = ["smartgliding-web"]
}

target "smartgliding-web" {
  dockerfile = "Dockerfile"
  tags = [
    "${REGISTRY}:${TAG}",
    "${REGISTRY}:latest"
  ]
  platforms = [
    "linux/amd64",
    "linux/arm64"
  ]
  cache-from = [
    "type=gha"
  ]
  cache-to = [
    "type=gha,mode=max"
  ]
  args = {
    BUILDKIT_INLINE_CACHE = "1"
  }
} 