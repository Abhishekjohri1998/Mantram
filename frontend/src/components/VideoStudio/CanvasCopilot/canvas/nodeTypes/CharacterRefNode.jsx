import BaseNode from './BaseNode';
export default function CharacterRefNode({ data, selected }) {
    const urls = data?.params?.urls || [];
    return (
        <BaseNode data={data} selected={selected} icon="👤" costClass="free" accentColor="#8b5cf6"
            inputPorts={[{ id: 'images', type: 'asset_list', label: 'Reference Images', required: false, multi: true }]}
            outputPorts={[{ id: 'ref', type: 'ref', label: 'Character Ref' }]}
        >
            {urls.length > 0 ? (
                <div className="node-ref-thumbs">
                    {urls.slice(0,3).map((u,i) => <img key={i} src={u} className="node-ref-thumb" alt="ref" />)}
                </div>
            ) : (
                <div className="node-text-preview"><span style={{opacity:0.35,fontStyle:'italic'}}>No images — configure in inspector</span></div>
            )}
        </BaseNode>
    );
}
