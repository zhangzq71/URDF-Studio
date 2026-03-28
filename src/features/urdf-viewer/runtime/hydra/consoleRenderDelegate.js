// This is a complete Hydra render delegate.
// It doesn't do anything useful, but it logs out all the calls and arguments it receives. 
export const delegate = {
    createSPrim: () => ({
        updateNode: () => { },
        updateFinished: () => { },
    }),
    createRPrim: () => ({
        setMaterial() { },
        updatePoints() { },
        updateIndices() { },
        updateNormals() { },
        setTransform() { },
        updatePrimvar() { },
        skelDetected() { },
        setGeomSubsetMaterial() { },
    }),
    CommitResources() { },
}
