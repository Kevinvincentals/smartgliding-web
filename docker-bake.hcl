// Docker Bake configuration for multi-platform builds
variable "REGISTRY" {
  default = "ghcr.io/kevinvincentals/smartgliding-web"
}

group "default" {
  targets = ["smartgliding-web"]
}

target "smartgliding-web" {
  dockerfile = "Dockerfile"
  tags = [
    "${REGISTRY}:latest",
    "${REGISTRY}:main"
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