tools/node-modules make_package_lock_json || ( \
		sed -i 's/local sha="${1-$(get_index_gitlink node_modules)}"/local sha="${2-$(get_index_gitlink node_modules)}"/' tools/node-modules && \
		tools/node-modules checkout --force && \
		sed -i 's/"name": "podman"/"name": "docker"/' node_modules/.package.json && \
		sed -i 's/"description": "Cockpit UI for Podman Containers"/"description": "Cockpit UI for Docker Containers"/' node_modules/.package.json && \
		sed -i 's/"repository": "git@github.com:cockpit-project\/cockpit-podman.git"/"repository": "https:\/\/github.com\/chabad360\/cockpit-docker.git"/' node_modules/.package.json && \
		sed -i 's/"name": "podman"/"name": "docker"/' node_modules/.package-lock.json && \
		tools/node-modules make_package_lock_json \
	)