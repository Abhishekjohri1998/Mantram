import BaseNode from './BaseNode';
export default function VoiceoverNode({ data, selected }) {
    return (
        <BaseNode data={data} selected={selected} icon="🎙️" costClass="billed" accentColor="#FF4D00"
            inputPorts={[{ id: 'script', type: 'text', label: 'Script', required: true }]}
            outputPorts={[{ id: 'audio', type: 'audio', label: 'Audio' }]}
        />
    );
}
