// Make Enzyme functions available in all test files without importing
import React from 'react'
import { shallow, render, mount } from 'enzyme';
import sinon from 'sinon'

global.React = React

global.mount = mount;
global.render = render;
global.shallow = shallow;
global.sinon = sinon;
global.cssName = '.rs3'

global.selectComponentContext = {
  context: {
    cssClassNamePrefix: global.cssName.slice(1)
  }
}

global.mock = {
  options: [
    { id: 3, text: 'three' },
    { id: 4, text: 'four' },
    { id: 5, text: 'five' },
    { id: 6, text: 'six' },
    { id: 7, text: 'seven' },
    { id: 8, text: 'eight' },
    { id: 9, text: 'nine' },
    { id: 10, text: 'ten' },
    { id: 11, text: 'eleven' },
    { id: 12, text: 'twelve' },
  ],
  renderer({ text }) {
    return (<span>{ text }</span>)
  },
}

// Skip createElement warnings but fail tests on any other warning
console.error = message => {
  if (!/(React.createElement: type should not be null)/.test(message)) {
    throw new Error(message);
  }
};
