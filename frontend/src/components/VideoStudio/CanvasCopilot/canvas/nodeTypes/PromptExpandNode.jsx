import BaseNode from './BaseNode';
export default function PromptExpandNode({ data, selected }) {
    return (
        <BaseNode data={data} selected={selected} icon="✨" costClass="low" accentColor="#f59e0b"
            inputPorts={[{ id: 'text', type: 'text', label: 'Brief', required: true }]}
            outputPorts={[{ id: 'text', type: 'text', label: 'Expanded Prompt' }]}
        />
    );
}
