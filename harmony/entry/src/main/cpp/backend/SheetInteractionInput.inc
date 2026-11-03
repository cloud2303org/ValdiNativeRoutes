// The ordinary input-enabled predicate plus exact hostParent mount traversal.
// Kept separately so the real body can run against the SDK fixture boundary.
static std::shared_ptr<Node> interactionParent(const Node& node);

static bool inputEnabled(const Node& node) {
    if (!node.handle || node.disposing || node.backend->suspended || node.backend->stopped ||
        node.backend->shuttingDown || !node.touchEnabled) return false;
    auto current = interactionParent(node);
    const Node* root = &node;
    std::vector<const Node*> visited {&node};
    while (current) {
        if (std::find(visited.begin(), visited.end(), current.get()) != visited.end()) return false;
        visited.push_back(current.get());
        if (!current->touchEnabled || current->disposing || current->backend != node.backend) return false;
        root = current.get();
        current = interactionParent(*current);
    }
    return root->content != nullptr || root->hostParent != nullptr;
}
